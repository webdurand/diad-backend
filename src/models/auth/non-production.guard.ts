import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";


@Injectable()
export class NonProductionGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const env = process.env.NODE_ENV;
    const override = process.env.ALLOW_TEST_ENDPOINTS === "true";

    if (env === "production" && !override) {
      throw new ForbiddenException({
        code: "DISABLED_IN_PRODUCTION",
        message:
          "Este endpoint está desabilitado em produção. Use ALLOW_TEST_ENDPOINTS=true para override em staging.",
      });
    }

    return true;
  }
}
