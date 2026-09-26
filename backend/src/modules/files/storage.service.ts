// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError } from '../../core/errors/domain.errors';

export interface StoredObject {
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  checksumSha256: string;
}

/**
 * Object storage abstraction.
 *
 * `local` writes under STORAGE_LOCAL_PATH and is meant for development and
 * single-node self-hosting. `s3` is the production path — the driver is
 * selected by config so the rest of the app never branches on it.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) private readonly config: RootConfig) {
    this.root = resolve(config.storage.localPath);
  }

  async put(
    prefix: string,
    filename: string,
    content: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    const bucket =
      this.config.storage.driver === 's3' ? (this.config.storage.s3.bucket ?? 'cwork') : 'local';
    const safeName = sanitiseFilename(filename);
    const objectKey = `${prefix}/${new Date().getUTCFullYear()}/${randomUUID()}-${safeName}`;
    const checksumSha256 = createHash('sha256').update(content).digest('hex');

    if (this.config.storage.driver === 's3') {
      // Kept as an explicit error rather than a silent local fallback: writing
      // payslips to a container's disk because S3 was misconfigured would be a
      // data-loss bug that only surfaces on the next deploy.
      throw new BusinessRuleError(
        'STORAGE_DRIVER_NOT_IMPLEMENTED',
        'The S3 storage driver requires @aws-sdk/client-s3; install it and implement StorageService.put',
      );
    }

    const target = this.resolveLocal(objectKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { mode: 0o600 });
    this.logger.debug(`Stored ${objectKey} (${content.length} bytes, ${contentType})`);

    return { bucket, objectKey, sizeBytes: content.length, checksumSha256 };
  }

  async get(objectKey: string): Promise<Buffer> {
    if (this.config.storage.driver === 's3') {
      throw new BusinessRuleError(
        'STORAGE_DRIVER_NOT_IMPLEMENTED',
        'The S3 storage driver requires @aws-sdk/client-s3; install it and implement StorageService.get',
      );
    }
    return readFile(this.resolveLocal(objectKey));
  }

  async remove(objectKey: string): Promise<void> {
    if (this.config.storage.driver === 's3') return;
    try {
      await unlink(this.resolveLocal(objectKey));
    } catch (error) {
      this.logger.warn(`Could not delete ${objectKey}: ${String(error)}`);
    }
  }

  /** Blocks path traversal: the resolved path must stay inside the root. */
  private resolveLocal(objectKey: string): string {
    const target = resolve(join(this.root, objectKey));
    if (!target.startsWith(this.root + '/') && target !== this.root) {
      throw new BusinessRuleError(
        'INVALID_OBJECT_KEY',
        'Resolved storage path escapes the storage root',
      );
    }
    return target;
  }
}

function sanitiseFilename(filename: string): string {
  return filename
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .replace(/_{2,}/g, '_')
    .slice(-120);
}
