import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  requestId?: string;
  timestamp: string;
}

/**
 * Single exit point for every error. Two rules:
 *  1. Clients get a stable `code` plus a safe message — never a stack trace or
 *     a database error string that leaks column names.
 *  2. Server-side, the full error is logged with the request id so support can
 *     correlate a user report to a log line.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const body = this.toErrorBody(exception, request);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${body.statusCode} ${body.code}`);
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown, request: Request & { id?: string }): ErrorBody {
    const base = {
      path: request.url,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const p = payload as Record<string, unknown>;
        return {
          ...base,
          statusCode: status,
          code: (p.code as string) ?? defaultCodeFor(status),
          message: normaliseMessage(p.message ?? exception.message),
          details: p.details ?? (Array.isArray(p.message) ? p.message : undefined),
        };
      }
      return {
        ...base,
        statusCode: status,
        code: defaultCodeFor(status),
        message: String(payload),
      };
    }

    if (isMulterError(exception)) {
      return { ...base, ...mapMulterError(exception) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return { ...base, ...mapPrismaError(exception) };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'INVALID_QUERY',
        message: 'The request could not be processed',
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }
}

function normaliseMessage(message: unknown): string {
  if (Array.isArray(message)) return message.join('; ');
  return String(message);
}

function defaultCodeFor(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_FAILED';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'ACCESS_DENIED';
    case HttpStatus.NOT_FOUND:
      return 'RESOURCE_NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PAYLOAD_TOO_LARGE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}

/** Prisma codes carry column names, so we translate rather than forward them. */
function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'P2002':
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'DUPLICATE_VALUE',
        message: 'A record with these unique values already exists',
      };
    case 'P2003':
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        message: 'A referenced record does not exist',
      };
    case 'P2025':
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested record was not found',
      };
    default:
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'DATABASE_ERROR',
        message: 'A database error occurred',
      };
  }
}

/**
 * A multipart request the parser refused is the client's fault, not ours.
 *
 * Nest's own multer interceptor translates these, but it does so by matching
 * the error *message* against a table it ships — and multer's messages are not
 * that table's contract. Multer 2.4 renamed `LIMIT_UNEXPECTED_FILE` from
 * "Unexpected field" to "Unexpected file field" and added three codes Nest has
 * never heard of, and every one of them fell through to a 500 with a stack
 * trace. Multer's own documentation says to check `err.code`, so that is what
 * this does; whatever Nest still translates arrives here already an
 * `HttpException` and is handled above, with the same status and code.
 *
 * Matched structurally rather than with `instanceof`: multer is a transitive
 * dependency of `@nestjs/platform-express`, and importing it directly would
 * claim a direct one.
 */
function isMulterError(exception: unknown): exception is Error & { code: string } {
  return (
    exception instanceof Error &&
    exception.name === 'MulterError' &&
    typeof (exception as { code?: unknown }).code === 'string'
  );
}

function mapMulterError(error: Error & { code: string }): {
  statusCode: number;
  code: string;
  message: string;
} {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'PAYLOAD_TOO_LARGE',
      message: error.message,
    };
  }

  // The message is multer's own and says nothing about the server. The
  // offending field name is deliberately not echoed: it is attacker-chosen and
  // can be megabytes long, which is the same denial of service the limits exist
  // to prevent.
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'VALIDATION_FAILED',
    message: error.message,
  };
}
