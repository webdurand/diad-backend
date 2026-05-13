import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthRequest } from "./auth.types";
import { DiadLogger } from "../../common/observability/logger/diad-logger.service";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly serviceKey: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(AuthGuard.name);
    this.serviceKey =
      this.configService.get<string>("SERVICE_KEY") ?? "diad-internal-dev";
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();


    const incomingServiceKey = request.headers["x-service-key"] as
      | string
      | undefined;
    if (incomingServiceKey && incomingServiceKey === this.serviceKey) {
      const userId = request.headers["x-user-id"] as string | undefined;
      request.user = {
        id: userId ?? "service",
        email: "service@diad.internal",
        name: "Service",
        role: "admin",
      };
      return true;
    }


    const cookieName = this.authService.getCookieName();
    const cookieToken = request.cookies?.[cookieName];
    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;
    const token = cookieToken || bearerToken;

    this.logger.debug("auth.guard.check", {
      "http.request.method": request.method,
      "url.path": request.url,
      "request.origin": request.headers.origin ?? null,
      "auth.cookie_present": !!cookieToken,
      "auth.bearer_present": !!bearerToken,
    });

    if (!token) {
      throw new UnauthorizedException("Sessao ausente.");
    }

    const user = await this.authService.getUserFromToken(token);
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      username: user.username ?? undefined,
      role: user.role ?? "user",
    };
    return true;
  }
}
