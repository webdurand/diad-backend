import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.[this.authService.getCookieName()];
    if (!token) {
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
