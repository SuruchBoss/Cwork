// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** Baht as typed from a filing: digits, at most two decimals, no separators or signs. */
const BAHT = /^\d{1,12}(\.\d{1,2})?$/;
const BAHT_MESSAGE = 'must be an amount in baht with at most two decimals, such as 12345.67';

/**
 * The totals the outside filings produced (CW-089). Strings, not numbers, so a
 * satang is never lost to a float. At least one is needed; the service says so.
 */
export class ComparePeriodDto {
  @ApiPropertyOptional({
    example: '12345.67',
    description: "The withholding-tax total e-Filing produced for the month's ภ.ง.ด.1",
  })
  @IsOptional()
  @Matches(BAHT, { message: `taxFiled ${BAHT_MESSAGE}` })
  taxFiled?: string;

  @ApiPropertyOptional({
    example: '9000.00',
    description: 'The social security total filed, the employee and employer shares together',
  })
  @IsOptional()
  @Matches(BAHT, { message: `ssoFiled ${BAHT_MESSAGE}` })
  ssoFiled?: string;
}
