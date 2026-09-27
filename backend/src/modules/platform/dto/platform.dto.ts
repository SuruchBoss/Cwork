// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty } from '@nestjs/swagger';

export class PlatformConfigDto {
  @ApiProperty({
    description:
      'Whether this deployment has the HR assistant switched on. Both clients ' +
      'hide their entry point to it when this is false.',
  })
  assistantEnabled!: boolean;

  @ApiProperty({
    description:
      'Whether this is the public demo (CW-031): one-click sign-in, and the data ' +
      'put back every hour. The console asks /demo for the schedule when it is.',
  })
  demo!: boolean;
}
