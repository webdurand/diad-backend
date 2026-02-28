import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookieName = this.authService.getCookieName();
    const token = request.cookies?.[cookieName];

    this.logger.debug(
      `[AuthGuard] ${request.method} ${request.url} | origin=${request.headers.origin ?? 'none'} | cookie present=${!!token} | cookies keys=${Object.keys(request.cookies ?? {}).join(',')}`,
    );

    if (!token) {
      this.logger.warn(
        `[AuthGuard] REJECTED - no cookie '${cookieName}' found. Headers: ${JSON.stringify({ cookie: request.headers.cookie?.substring(0, 80), origin: request.headers.origin, referer: request.headers.referer })}`,
      );
      throw new UnauthorizedException('Sessao ausente.');
    }

    const user = await this.authService.getUserFromToken(token);
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      username: user.username ?? undefined,
    };
    return true;
  }
}
