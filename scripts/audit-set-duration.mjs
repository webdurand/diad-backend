import "dotenv/config";
import pg from "pg";

const [mode, id, selectorOrRounds, roundsRaw] = process.argv.slice(2);
const rounds = Number(mode === "effect" ? roundsRaw : selectorOrRounds);
if (
  !["concentration", "area", "effect"].includes(mode) ||
  !id ||
  !Number.isInteger(rounds) ||
  rounds < 1
) {
  throw new Error(
    "Uso: node scripts/audit-set-duration.mjs " +
      "<concentration|area> <id> <rodadas> | " +
      "effect <participantId> <sourceSpellSlug> <rodadas>",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  if (mode === "concentration") {
    const result = await client.query(
      `UPDATE encounter_participants
         SET concentration_rounds_remaining = $2
       WHERE id = $1
       RETURNING id, display_name, is_concentrating, concentrating_on,
                 concentration_rounds_remaining`,
      [id, rounds],
    );
    if (result.rowCount !== 1) throw new Error("Participante não encontrado");
    console.log(JSON.stringify(result.rows[0]));
  } else if (mode === "area") {
    const result = await client.query(
      `UPDATE persistent_area_effects
         SET duration_rounds_remaining = $2
       WHERE id = $1
       RETURNING id, source_spell, effect_kind, duration_rounds_remaining`,
      [id, rounds],
    );
    if (result.rowCount !== 1) throw new Error("Área não encontrada");
    console.log(JSON.stringify(result.rows[0]));
  } else {
    const sourceSpellSlug = selectorOrRounds;
    if (!sourceSpellSlug) throw new Error("sourceSpellSlug obrigatório");
    const selected = await client.query(
      `SELECT display_name, effect_instances
         FROM encounter_participants
        WHERE id = $1`,
      [id],
    );
    if (selected.rowCount !== 1) throw new Error("Participante não encontrado");

    let changed = 0;
    const effectInstances = (selected.rows[0].effect_instances ?? []).map(
      (effect) => {
        if (effect.sourceSpellSlug !== sourceSpellSlug) return effect;
        if (effect.expiresAt?.kind !== "rounds") return effect;
        changed += 1;
        return {
          ...effect,
          expiresAt: { ...effect.expiresAt, value: rounds },
        };
      },
    );
    if (changed === 0) {
      throw new Error(
        `Nenhum efeito por rodadas de ${sourceSpellSlug} encontrado`,
      );
    }
    await client.query(
      `UPDATE encounter_participants
          SET effect_instances = $2::jsonb
        WHERE id = $1`,
      [id, JSON.stringify(effectInstances)],
    );
    console.log(
      JSON.stringify({
        id,
        displayName: selected.rows[0].display_name,
        sourceSpellSlug,
        rounds,
        changed,
      }),
    );
  }
} finally {
  await client.end();
}
