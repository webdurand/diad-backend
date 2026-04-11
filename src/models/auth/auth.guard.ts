import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly serviceKey: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.serviceKey = this.configService.get<string>('SERVICE_KEY') ?? 'diad-internal-dev';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    // Internal service-to-service calls (Python agent → NestJS)
    const incomingServiceKey = request.headers['x-service-key'] as string | undefined;
    if (incomingServiceKey && incomingServiceKey === this.serviceKey) {
      const userId = request.headers['x-user-id'] as string | undefined;
      request.user = {
        id: userId ?? 'service',
        email: 'service@diad.internal',
        name: 'Service',
        role: 'admin',
      };
      return true;
    }

    // Normal cookie-based auth
    const cookieName = this.authService.getCookieName();
    const token = request.cookies?.[cookieName];

    this.logger.debug(
      `[AuthGuard] ${request.method} ${request.url} | origin=${request.headers.origin ?? 'none'} | cookie present=${!!token}`,
    );

    if (!token) {
      throw new UnauthorizedException('Sessao ausente.');
    }

    const user = await this.authService.getUserFromToken(token);
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      username: user.username ?? undefined,
      role: user.role ?? 'user',
    };
    return true;
  }
}
