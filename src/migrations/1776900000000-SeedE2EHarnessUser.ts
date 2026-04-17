import * as bcrypt from 'bcryptjs';
import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 012 — Seed do usuário E2E usado pelo game-validation-harness.
 *
 * Cria `e2e-harness@diad.local` com role=`admin` (precisa chamar endpoints
 * /admin/seed-character e /game/dice/seed).
 *
 * Senha é lida de `E2E_HARNESS_PASSWORD` no env. Se ausente, a migration
 * **skipa silenciosamente** (não falha) — permite rodar `migration:run` em
 * ambientes dev que não usam harness.
 *
 * Em produção (sem `ALLOW_TEST_ENDPOINTS=true`), também skipa — user E2E
 * não deve existir em prod.
 *
 * Idempotente: ON CONFLICT (email) DO NOTHING.
 */
export class SeedE2EHarnessUser1776900000000 implements MigrationInterface {
  name = 'SeedE2EHarnessUser1776900000000';

  private readonly logger = new Logger(SeedE2EHarnessUser1776900000000.name);
  private readonly email = 'e2e-harness@diad.local';
  private readonly username = 'e2e-harness';
  private readonly displayName = 'E2E Harness';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const env = process.env.NODE_ENV;
    const override = process.env.ALLOW_TEST_ENDPOINTS === 'true';
    const password = process.env.E2E_HARNESS_PASSWORD;

    if (env === 'production' && !override) {
      this.logger.log(
        'SKIP: ambiente production sem ALLOW_TEST_ENDPOINTS=true.',
      );
      return;
    }

    if (!password || password.trim().length === 0) {
      this.logger.warn(
        'SKIP: E2E_HARNESS_PASSWORD não está definida. Pule essa migration em dev; defina a env var pra rodar o harness 012.',
      );
      return;
    }

    if (password.length < 8) {
      throw new Error(
        'E2E_HARNESS_PASSWORD muito curta (< 8 caracteres). Use um valor robusto.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await queryRunner.query(
      `
      INSERT INTO users (email, username, name, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, now(), now())
      ON CONFLICT (email) DO NOTHING
      `,
      [this.email, this.username, this.displayName, passwordHash, 'admin'],
    );

    this.logger.log(`OK: user ${this.email} criado (ou já existia).`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM users WHERE email = $1`, [this.email]);
    this.logger.log(`DOWN: user ${this.email} removido.`);
  }
}
