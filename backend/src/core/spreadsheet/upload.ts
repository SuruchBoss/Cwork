// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from '@nestjs/common';

/** An uploaded spreadsheet, as an import service takes it. */
export interface UploadedTable {
  originalname: string;
  buffer: Buffer;
}

/**
 * One spreadsheet, and nothing else: no text fields ride along with it (see
 * the files controller for why that limit is the one doing the work). 5 MB is
 * several thousand rows as .xlsx and far more as CSV.
 */
export const IMPORT_LIMITS = {
  fileSize: 5 * 1024 * 1024,
  files: 1,
  fields: 0,
  parts: 1,
  fieldNameSize: 100,
  headerPairs: 32,
} as const;

/** The request body, for the API docs. */
export const IMPORT_BODY = {
  schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
} as const;

export function requireUpload(file: Express.Multer.File | undefined): UploadedTable {
  if (!file) throw new BadRequestException('Attach the spreadsheet as the "file" part');
  // Multer reads the name as Latin-1; a Thai file name arrives as UTF-8 bytes.
  return {
    originalname: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    buffer: file.buffer,
  };
}

/** Sends a generated .xlsx as a download. */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
