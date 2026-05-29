import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 047 — repara mundos/sessões gerados antes da atribuição de POI de
 * residência. Sintoma: NPCs com `home_location_id` mas `home_poi_id` nulo →
 * `session_npc_state.current_poi_id` nulo → `listByPoi` não encontra ninguém →
 * cena nasce vazia e o narrador inventa figurantes anônimos (a 1ª quest, do tipo
 * "Conversar com X", fica incompletável porque X nunca aparece no POI).
 *
 * Causa-raiz: `location_pois.kind` tem default "wild" no banco e a materialização
 * antiga nunca atribuía `kind`, então todo POI nascia "wild" e os filtros de
 * residente (`kind !== 'wild'`) rejeitavam todos.
 *
 * Backfill (idempotente, ordem importa):
 *  (a) POIs acessíveis de locais civilizados: "wild" -> "safe".
 *  (b) npcs.home_poi_id <- POI default da home_location (prefere default/não-wild).
 *  (c) session_npc_state.current_poi_id <- npcs.home_poi_id (sessões já abertas).
 */
export class BackfillNpcHomePoi1809100000000 implements MigrationInterface {
  name = "BackfillNpcHomePoi1809100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // (a) Corrige o kind de POIs acessíveis em locais civilizados (não selvagens).
    await queryRunner.query(`
      UPDATE location_pois p
      SET kind = 'safe'
      FROM locations l
      WHERE l.id = p.location_id
        AND p.kind = 'wild'
        AND p.is_known_to_party = true
        AND p.is_locked = false
        AND p.is_secret = false
        AND lower(coalesce(l.type, '')) !~ '(wild|selv|dungeon|masmorra|floresta|forest|cave|caverna|ruin)'
    `);

    // (b) Atribui home_poi_id ao POI default da home_location para NPCs canônicos
    //     que só tinham a location (1 POI por location, preferindo default/não-wild).
    await queryRunner.query(`
      UPDATE npcs n
      SET home_poi_id = sub.id
      FROM (
        SELECT DISTINCT ON (lp.campaign_id, lp.location_id)
               lp.id, lp.campaign_id, lp.location_id
        FROM location_pois lp
        WHERE lp.is_known_to_party = true
          AND lp.is_locked = false
        ORDER BY lp.campaign_id,
                 lp.location_id,
                 lp.is_default DESC,
                 (lp.kind = 'wild') ASC,
                 lp.sort_order ASC,
                 lp.name ASC
      ) sub
      WHERE n.home_poi_id IS NULL
        AND n.home_location_id IS NOT NULL
        AND sub.location_id = n.home_location_id
        AND sub.campaign_id = n.campaign_id
    `);

    // (c) Reidrata sessões já abertas: coloca os NPCs no POI agora resolvido.
    await queryRunner.query(`
      UPDATE session_npc_state s
      SET current_poi_id = n.home_poi_id,
          current_location_id = COALESCE(s.current_location_id, n.home_location_id)
      FROM npcs n
      WHERE s.npc_id = n.id
        AND s.current_poi_id IS NULL
        AND n.home_poi_id IS NOT NULL
    `);
  }

  // Backfill de dados — não há estado anterior a restaurar (os valores eram nulos
  // ou "wild" por bug). Reverter não é significativo; mantém-se como no-op.
  async down(): Promise<void> {
    /* irreversible data backfill — intentionally a no-op */
  }
}
