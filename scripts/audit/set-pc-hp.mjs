import process from "node:process";

import "dotenv/config";
import pg from "pg";

const [encounterId, participantId, rawTargetHp] = process.argv.slice(2);
const targetHp = Number(rawTargetHp);

if (
  !encounterId ||
  !participantId ||
  !Number.isSafeInteger(targetHp) ||
  targetHp < 1
) {
  throw new Error(
    "Uso: node scripts/audit/set-pc-hp.mjs " +
      "<encounterId> <participantId> <pvAlvoPositivo>",
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const withoutDeathConditions = (value) =>
  (Array.isArray(value) ? value : []).filter(
    (condition) =>
      !["dead", "dying", "stable", "unconscious"].includes(
        String(condition).toLowerCase(),
      ),
  );

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
        max_hp,
        conditions
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

  const stateResult = await client.query(
    `
      SELECT
        character_id,
        current_hp,
        temp_hp,
        conditions
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

  const state = stateResult.rows[0];
  const maxHp = Number(participant.max_hp);
  if (!Number.isSafeInteger(maxHp) || maxHp < 1 || targetHp > maxHp) {
    throw new Error(`PV alvo inválido: ${targetHp}/${participant.max_hp}`);
  }

  const stateConditions = withoutDeathConditions(state.conditions);
  const participantConditions = withoutDeathConditions(participant.conditions);
  await client.query(
    `
      UPDATE character_state
      SET
        current_hp = $1,
        temp_hp = 0,
        death_saves_success = 0,
        death_saves_fail = 0,
        conditions = $2::jsonb
      WHERE character_id = $3
    `,
    [targetHp, JSON.stringify(stateConditions), participant.character_id],
  );
  const participantUpdate = await client.query(
    `
      UPDATE encounter_participants
      SET
        current_hp = $1,
        temp_hp = 0,
        is_defeated = FALSE,
        dying_state = 'none',
        conditions = $2::jsonb
      WHERE id = $3 AND encounter_id = $4 AND character_id = $5
    `,
    [
      targetHp,
      JSON.stringify(participantConditions),
      participantId,
      encounterId,
      participant.character_id,
    ],
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
      before: {
        participantHp: participant.current_hp,
        characterHp: state.current_hp,
        tempHp: state.temp_hp,
      },
      after: {
        currentHp: targetHp,
        tempHp: 0,
        maxHp,
      },
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
