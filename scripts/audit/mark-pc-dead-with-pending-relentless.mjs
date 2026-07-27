import process from "node:process";

import "dotenv/config";
import pg from "pg";

const [encounterId, participantId] = process.argv.slice(2);

if (!encounterId || !participantId) {
  throw new Error(
    "Uso: node scripts/audit/mark-pc-dead-with-pending-relentless.mjs " +
      "<encounterId> <participantId>",
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
  const participantResult = await client.query(
    `
      SELECT
        id,
        encounter_id,
        character_id,
        type,
        current_hp,
        is_defeated,
        dying_state,
        effect_instances
      FROM encounter_participants
      WHERE id = $1
      FOR UPDATE
    `,
    [participantId],
  );
  if (participantResult.rowCount !== 1) {
    throw new Error(`Participante ${participantId} não encontrado`);
  }

  const participant = participantResult.rows[0];
  if (participant.encounter_id !== encounterId) {
    throw new Error(
      `Participante pertence a ${participant.encounter_id}, não a ${encounterId}`,
    );
  }
  if (participant.type !== "pc" || !participant.character_id) {
    throw new Error("A fixture aceita somente participante PC com ficha");
  }
  if (
    Number(participant.current_hp) !== 0 ||
    participant.dying_state !== "dying" ||
    participant.is_defeated === true
  ) {
    throw new Error(
      "A fixture exige um PC a 0 PV, morrendo e ainda não derrotado",
    );
  }

  const effects = Array.isArray(participant.effect_instances)
    ? participant.effect_instances
    : [];
  const pending = effects.find(
    (effect) => effect?.kind === "relentless_endurance_pending",
  );
  if (!pending) {
    throw new Error(
      "Nenhuma decisão pendente de Relentless Endurance foi encontrada",
    );
  }

  const stateResult = await client.query(
    `
      SELECT character_id, current_hp, conditions
      FROM character_state
      WHERE character_id = $1
      FOR UPDATE
    `,
    [participant.character_id],
  );
  if (stateResult.rowCount !== 1) {
    throw new Error(
      `Estado da ficha ${participant.character_id} não encontrado`,
    );
  }

  await client.query(
    `
      UPDATE character_state
      SET
        current_hp = 0,
        temp_hp = 0,
        death_saves_success = 0,
        death_saves_fail = 3,
        conditions = '["dead"]'::jsonb
      WHERE character_id = $1
    `,
    [participant.character_id],
  );
  const participantUpdate = await client.query(
    `
      UPDATE encounter_participants
      SET
        current_hp = 0,
        temp_hp = 0,
        is_defeated = TRUE,
        dying_state = 'dead',
        conditions = '["dead"]'::jsonb,
        condition_instances = '[]'::jsonb
      WHERE id = $1 AND encounter_id = $2 AND character_id = $3
    `,
    [participantId, encounterId, participant.character_id],
  );
  if (participantUpdate.rowCount !== 1) {
    throw new Error("Atualização concorrente não persistiu a fixture");
  }

  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      encounterId,
      participantId,
      characterId: participant.character_id,
      pendingEffectId: pending.id,
      before: {
        currentHp: participant.current_hp,
        dyingState: participant.dying_state,
        isDefeated: participant.is_defeated,
      },
      after: {
        currentHp: 0,
        dyingState: "dead",
        isDefeated: true,
        pendingPreservedForStaleDecisionTest: true,
      },
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
