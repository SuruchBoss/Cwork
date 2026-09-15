import { Module } from '@nestjs/common';
import { CryptoService } from '../../core/security/crypto.service';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

/**
 * Provides its own `CryptoService` rather than taking the one `AuthModule`
 * exports globally. It is a stateless helper over config, so a second instance
 * costs nothing — and it means this module stands up on its own in the tiny
 * context `db:init` boots, which has no reason to load authentication, the
 * scheduler or anything else that only matters once the install exists.
 */
@Module({
  controllers: [SetupController],
  providers: [SetupService, CryptoService],
  exports: [SetupService],
})
export class SetupModule {}
