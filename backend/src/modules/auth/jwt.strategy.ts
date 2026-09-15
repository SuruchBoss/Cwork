import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { APP_CONFIG } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { UserContextService } from './user-context.service';

export interface AccessTokenPayload {
  sub: string;
  org: string;
  sid: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(APP_CONFIG) config: RootConfig,
    private readonly userContext: UserContextService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.accessSecret,
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    // A global password reset or forced logout bumps `sessionsValidFrom`, which
    // invalidates every access token issued before that moment.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { sessionsValidFrom: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (payload.iat * 1000 < user.sessionsValidFrom.getTime()) {
      throw new UnauthorizedException('Session has been invalidated, please sign in again');
    }

    const context = await this.userContext.resolve(payload.sub);
    if (context.organizationId !== payload.org) {
      throw new UnauthorizedException('Token organisation mismatch');
    }
    return { ...context, sessionId: payload.sid };
  }
}
