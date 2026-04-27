import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

/**
 * Guard que bloqueia endpoints em ambiente de produção.
 *
 * Libera quando:
 *   - `NODE_ENV !== 'production'`, OU
 *   - `process.env.ALLOW_TEST_ENDPOINTS === 'true'` (override explícito para staging controlado).
 *
 * Usado em endpoints destinados a teste/harness (ex: dice seed, seed-character),
 * que não devem ficar acessíveis em produção mesmo para admins.
 */
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
