import process from "node:process";

import "dotenv/config";
import pg from "pg";

const [encounterId, summonId, rawRemaining] = process.argv.slice(2);
const durationRoundsRemaining = Number(rawRemaining);

if (
  !encounterId ||
  !summonId ||
  !Number.isSafeInteger(durationRoundsRemaining) ||
  durationRoundsRemaining < 0
) {
  throw new Error(
    "Uso: node scripts/audit/set-air-elemental-duration.mjs " +
      "<encounterId> <summonId> <rodadasRestantes>",
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("BEGIN");
  const result = await client.query(
    `
      SELECT encounter_id, applied_effects
      FROM encounter_participants
      WHERE id = $1
      FOR UPDATE
    `,
    [summonId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Summon ${summonId} não encontrado`);
  }

  const row = result.rows[0];
  if (row.encounter_id !== encounterId) {
    throw new Error(
      `Summon pertence a ${row.encounter_id}, não a ${encounterId}`,
    );
  }

  const effects = Array.isArray(row.applied_effects)
    ? row.applied_effects
    : [];
  const ritualEffects = effects.filter(
    (effect) =>
      effect?.kind === "summon" &&
      effect?.metadata?.source === "aarakocra-air-elemental-ritual",
  );
  if (ritualEffects.length !== 1) {
    throw new Error(
      `Esperava um efeito do ritual Aarakocra; encontrei ${ritualEffects.length}`,
    );
  }

  const ritualEffect = ritualEffects[0];
  const durationRoundsTotal = Number(
    ritualEffect.metadata?.durationRoundsTotal,
  );
  if (
    !Number.isSafeInteger(durationRoundsTotal) ||
    durationRoundsTotal <= 0 ||
    durationRoundsRemaining > durationRoundsTotal
  ) {
    throw new Error(
      `Duração inválida: ${durationRoundsRemaining}/${durationRoundsTotal}`,
    );
  }

  const patchedEffects = effects.map((effect) =>
    effect === ritualEffect
      ? {
          ...effect,
          metadata: {
            ...effect.metadata,
            durationRoundsRemaining,
            durationCycleStarted: true,
          },
        }
      : effect,
  );
  const updated = await client.query(
    `
      UPDATE encounter_participants
      SET applied_effects = $1::jsonb
      WHERE id = $2 AND encounter_id = $3
    `,
    [JSON.stringify(patchedEffects), summonId, encounterId],
  );
  if (updated.rowCount !== 1) {
    throw new Error("Atualização concorrente não persistiu a fixture");
  }

  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      encounterId,
      summonId,
      durationRoundsTotal,
      durationRoundsRemaining,
      durationCycleStarted: true,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
