import { Inject, Injectable, Logger } from '@nestjs/common';
import { KnowledgeStatus, Prisma } from '@prisma/client';
import { APP_CONFIG } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';

export interface KnowledgeHit {
  documentId: string;
  title: string;
  category: string | null;
  chunkIndex: number;
  content: string;
  score: number;
}

/** Chunking keeps paragraphs whole where possible; overlap preserves context. */
const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  /**
   * Retrieval for the assistant.
   *
   * Lexical search is the default because it needs no embedding provider and no
   * pgvector data — MarMa HRIS must answer policy questions out of the box.
   * When embeddings are configured, vector results are merged in.
   */
  async search(
    organizationId: string,
    query: string,
    roleKeys: string[],
    limit = 5,
  ): Promise<KnowledgeHit[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const lexical = await this.lexicalSearch(organizationId, trimmed, roleKeys, limit);

    if (this.config.assistant.embeddingProvider === 'none') return lexical;

    try {
      const semantic = await this.semanticSearch(organizationId, trimmed, roleKeys, limit);
      return mergeHits(lexical, semantic, limit);
    } catch (error) {
      // Never fail a user's question because the vector index is unavailable.
      this.logger.warn(`Semantic search unavailable, using lexical only: ${String(error)}`);
      return lexical;
    }
  }

  /**
   * Postgres full-text + trigram similarity.
   *
   * Thai has no whitespace word boundaries, so `to_tsvector('simple', …)` alone
   * under-matches; the trigram term catches substring matches that tokenisation
   * misses.
   *
   * The tsvector is computed inline rather than read from a stored column, and
   * the matching GIN indexes are expression indexes. That way a missing index
   * costs a sequential scan instead of breaking search outright.
   */
  private async lexicalSearch(
    organizationId: string,
    query: string,
    roleKeys: string[],
    limit: number,
  ): Promise<KnowledgeHit[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        documentId: string;
        title: string;
        category: string | null;
        chunkIndex: number;
        content: string;
        score: number;
      }>
    >`
      SELECT
        d."id"          AS "documentId",
        d."title"       AS "title",
        d."category"    AS "category",
        c."chunkIndex"  AS "chunkIndex",
        c."content"     AS "content",
        GREATEST(
          ts_rank(to_tsvector('simple', c."content"), plainto_tsquery('simple', ${query})),
          similarity(c."content", ${query})
        )::float8       AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_documents" d ON d."id" = c."documentId"
      WHERE d."organizationId" = ${organizationId}::uuid
        AND d."status" = 'PUBLISHED'
        AND d."deletedAt" IS NULL
        AND (
          cardinality(d."visibleToRoles") = 0
          OR d."visibleToRoles" && ${roleKeys}::text[]
        )
        AND (
          to_tsvector('simple', c."content") @@ plainto_tsquery('simple', ${query})
          OR c."content" % ${query}
        )
      ORDER BY "score" DESC
      LIMIT ${limit}
    `;

    return rows;
  }

  /**
   * pgvector cosine search. Only reachable when an embedding provider is
   * configured; `embedQuery` returning null keeps this a no-op otherwise.
   */
  private async semanticSearch(
    organizationId: string,
    query: string,
    roleKeys: string[],
    limit: number,
  ): Promise<KnowledgeHit[]> {
    const embedding = await this.embedQuery(query);
    if (!embedding) return [];

    const vectorLiteral = `[${embedding.join(',')}]`;

    return this.prisma.$queryRaw<KnowledgeHit[]>`
      SELECT
        d."id"         AS "documentId",
        d."title"      AS "title",
        d."category"   AS "category",
        c."chunkIndex" AS "chunkIndex",
        c."content"    AS "content",
        (1 - (c."embedding" <=> ${vectorLiteral}::vector))::float8 AS "score"
      FROM "knowledge_chunks" c
      JOIN "knowledge_documents" d ON d."id" = c."documentId"
      WHERE d."organizationId" = ${organizationId}::uuid
        AND d."status" = 'PUBLISHED'
        AND d."deletedAt" IS NULL
        AND c."embedding" IS NOT NULL
        AND (
          cardinality(d."visibleToRoles") = 0
          OR d."visibleToRoles" && ${roleKeys}::text[]
        )
      ORDER BY c."embedding" <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
  }

  /**
   * Embedding hook.
   *
   * Left unimplemented on purpose: the default deployment has no embedding
   * provider, and silently calling a third-party API with HR policy text would
   * be a surprising data egress. Implement against your provider and return the
   * vector to enable semantic search.
   */
  private async embedQuery(_query: string): Promise<number[] | null> {
    return null;
  }

  // ------------------------------------------------------------------ authoring

  listDocuments(organizationId: string, status?: KnowledgeStatus) {
    return this.prisma.knowledgeDocument.findMany({
      where: { organizationId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        version: true,
        tags: true,
        visibleToRoles: true,
        effectiveFrom: true,
        indexedAt: true,
        updatedAt: true,
        _count: { select: { chunks: true } },
      },
    });
  }

  async getDocument(organizationId: string, id: string) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        chunks: { orderBy: { chunkIndex: 'asc' }, select: { chunkIndex: true, content: true } },
      },
    });
    if (!document) throw new NotFoundError('KnowledgeDocument', id);
    return document;
  }

  /** Creates a document and immediately indexes it into chunks. */
  async createDocument(
    user: AuthenticatedUser,
    input: {
      title: string;
      content: string;
      category?: string;
      tags?: string[];
      visibleToRoles?: string[];
      effectiveFrom?: string;
      publish?: boolean;
    },
  ) {
    const document = await this.prisma.knowledgeDocument.create({
      data: {
        organizationId: user.organizationId,
        title: input.title,
        content: input.content,
        category: input.category,
        tags: input.tags ?? [],
        visibleToRoles: input.visibleToRoles ?? [],
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
        status: KnowledgeStatus.DRAFT,
        createdById: user.userId,
      },
    });

    await this.reindex(user.organizationId, document.id, input.publish ?? true);
    return this.getDocument(user.organizationId, document.id);
  }

  async updateDocument(
    organizationId: string,
    id: string,
    input: {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      visibleToRoles?: string[];
    },
  ) {
    const existing = await this.getDocument(organizationId, id);

    await this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        ...input,
        // Bump the version whenever the text changes, so an answer can be traced
        // back to the exact policy revision it came from.
        version:
          input.content && input.content !== existing.content
            ? existing.version + 1
            : existing.version,
      },
    });

    if (input.content && input.content !== existing.content) {
      await this.reindex(organizationId, id, existing.status === KnowledgeStatus.PUBLISHED);
    }

    return this.getDocument(organizationId, id);
  }

  async setStatus(organizationId: string, id: string, status: KnowledgeStatus) {
    await this.getDocument(organizationId, id);
    return this.prisma.knowledgeDocument.update({ where: { id }, data: { status } });
  }

  async deleteDocument(organizationId: string, id: string): Promise<void> {
    await this.getDocument(organizationId, id);
    await this.prisma.knowledgeDocument.update({
      where: { id },
      data: { deletedAt: new Date(), status: KnowledgeStatus.ARCHIVED },
    });
  }

  /** Re-chunks a document. Chunks are replaced wholesale, never patched. */
  async reindex(organizationId: string, documentId: string, publish: boolean): Promise<number> {
    const document = await this.prisma.knowledgeDocument.findFirstOrThrow({
      where: { id: documentId, organizationId },
    });

    const chunks = chunkText(document.content);

    await this.prisma.$transaction([
      this.prisma.knowledgeChunk.deleteMany({ where: { documentId } }),
      this.prisma.knowledgeChunk.createMany({
        data: chunks.map((content, index) => ({
          documentId,
          chunkIndex: index,
          content,
          tokenCount: estimateTokens(content),
          metadata: { title: document.title, category: document.category } as Prisma.InputJsonValue,
        })),
      }),
      this.prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          status: publish ? KnowledgeStatus.PUBLISHED : KnowledgeStatus.DRAFT,
          indexedAt: new Date(),
        },
      }),
    ]);

    return chunks.length;
  }
}

/**
 * Splits text on paragraph boundaries, packing paragraphs up to the target size
 * and carrying a short overlap so a sentence split across chunks still retrieves.
 */
export function chunkText(
  text: string,
  targetChars = CHUNK_TARGET_CHARS,
  overlapChars = CHUNK_OVERLAP_CHARS,
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    // A single oversized paragraph is hard-split rather than dropped.
    if (paragraph.length > targetChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < paragraph.length; i += targetChars) {
        chunks.push(paragraph.slice(i, i + targetChars));
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > targetChars && current) {
      chunks.push(current);
      current = overlapChars > 0 ? `${current.slice(-overlapChars)}\n\n${paragraph}` : paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/** Rough token estimate; Thai averages ~2 chars per token, English ~4. */
export function estimateTokens(text: string): number {
  const thaiChars = (text.match(/[฀-๿]/g) ?? []).length;
  const otherChars = text.length - thaiChars;
  return Math.ceil(thaiChars / 2 + otherChars / 4);
}

/** Interleaves lexical and semantic hits, keeping the best score per chunk. */
function mergeHits(
  lexical: KnowledgeHit[],
  semantic: KnowledgeHit[],
  limit: number,
): KnowledgeHit[] {
  const merged = new Map<string, KnowledgeHit>();
  for (const hit of [...lexical, ...semantic]) {
    const key = `${hit.documentId}:${hit.chunkIndex}`;
    const existing = merged.get(key);
    if (!existing || hit.score > existing.score) merged.set(key, hit);
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
