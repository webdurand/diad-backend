import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 015 Eixo 1 — seed idempotente das ≥20 features-chave curadas com
 * categoria + narrative descriptor + tactical value + recharge rule RAW.
 *
 * Each entry é RAW-grounded (PHB 2014 / XPHB 2024). Onde a edição muda
 * recharge (ex: Bardic Inspiration 2014 long → 2024 short), prevalece
 * XPHB 2024 por ser o default do DIAD (spec 015 §Contexto).
 *
 * Re-executável: usa UPDATE com WHERE slug=... — se feature não existe
 * ainda (seed pendente de outra migration), o UPDATE 0 rows passa silent.
 */

interface Override {
  slug: string;
  category: 'active' | 'passive' | 'capstone' | 'resource';
  narrative: string;
  tactical: number;
  recharge: 'short' | 'long' | 'turn' | 'none';
  charges?: { max: number | null; formula?: string };
}

const OVERRIDES: Override[] = [
  // ── FIGHTER ─────────────────────────────────────────────────────────
  {
    slug: 'action-surge',
    category: 'resource',
    narrative: 'Extra ação no turno — recarga em descanso curto.',
    tactical: 9,
    recharge: 'short',
    charges: { max: 1, formula: 'level>=17 ? 2 : 1' },
  },
  {
    slug: 'second-wind',
    category: 'resource',
    narrative: 'Bonus action para recuperar 1d10+fighterLevel HP.',
    tactical: 7,
    recharge: 'short',
    charges: { max: 1, formula: 'floor((fighterLevel+1)/6)+1' },
  },
  {
    slug: 'indomitable',
    category: 'resource',
    narrative: 'Re-rolla save falho — 1×L9, 2×L13, 3×L17.',
    tactical: 8,
    recharge: 'long',
    charges: { max: null, formula: 'L9:1, L13:2, L17:3' },
  },
  {
    slug: 'extra-attack',
    category: 'passive',
    narrative: 'Attack action dispara 2 ataques (3 em L11, 4 em L20 Fighter).',
    tactical: 10,
    recharge: 'none',
  },

  // ── BARBARIAN ───────────────────────────────────────────────────────
  {
    slug: 'rage',
    category: 'resource',
    narrative: 'Bonus action — +dmg STR, resistência bludg/pierc/slash.',
    tactical: 10,
    recharge: 'long',
    charges: { max: null, formula: 'tabela PHB: 2→6 por nível' },
  },
  {
    slug: 'reckless-attack',
    category: 'active',
    narrative: 'Advantage nos ataques mas atacantes também têm advantage.',
    tactical: 6,
    recharge: 'turn',
  },
  {
    slug: 'relentless-rage',
    category: 'resource',
    narrative: 'Ao cair a 0 HP em Rage, CON save para ficar com 1 HP.',
    tactical: 7,
    recharge: 'short',
  },

  // ── BARD ────────────────────────────────────────────────────────────
  {
    slug: 'bardic-inspiration',
    category: 'resource',
    narrative: 'Bonus action — d6/d8/d10/d12 conforme nível; recarga descanso curto (XPHB 2024).',
    tactical: 8,
    recharge: 'short',
    charges: { max: null, formula: 'max(1, chaMod)' },
  },
  {
    slug: 'cutting-words',
    category: 'resource',
    narrative: 'Reação — subtrai 1d6-1d12 de attack/check/save inimigo visível.',
    tactical: 7,
    recharge: 'short',
    charges: { max: null, formula: 'usa pool Bardic Inspiration' },
  },
  {
    slug: 'countercharm',
    category: 'resource',
    narrative: 'Reação (Lore L6+) — anula charm/fear de aliado visível.',
    tactical: 6,
    recharge: 'short',
    charges: { max: null, formula: 'usa pool Bardic Inspiration' },
  },
  {
    slug: 'song-of-rest',
    category: 'passive',
    narrative: 'Short rest cura extra d6→d12 pra aliados gastando Hit Dice.',
    tactical: 3,
    recharge: 'none',
  },
  {
    slug: 'jack-of-all-trades',
    category: 'passive',
    narrative: 'Meio proficiency bonus em checks sem proficiência.',
    tactical: 4,
    recharge: 'none',
  },
  {
    slug: 'expertise',
    category: 'passive',
    narrative: 'Dobra proficiency bonus em skills escolhidas.',
    tactical: 6,
    recharge: 'none',
  },
  {
    slug: 'magical-secrets',
    category: 'passive',
    narrative: 'Aprende magias de qualquer classe.',
    tactical: 7,
    recharge: 'none',
  },

  // ── CLERIC / PALADIN ────────────────────────────────────────────────
  {
    slug: 'channel-divinity',
    category: 'resource',
    narrative: 'Ação divina — efeito varia por classe/subclasse; descanso curto.',
    tactical: 8,
    recharge: 'short',
    charges: { max: null, formula: 'varia por classe/nível' },
  },
  {
    slug: 'divine-intervention',
    category: 'resource',
    narrative: 'Action — chama deus direto (Cleric L10+). 1/descanso longo.',
    tactical: 9,
    recharge: 'long',
    charges: { max: 1 },
  },
  {
    slug: 'lay-on-hands',
    category: 'resource',
    narrative: 'Action — pool de cura 5×palLevel HP; também cura doença/veneno.',
    tactical: 8,
    recharge: 'long',
    charges: { max: null, formula: 'palLevel * 5' },
  },
  {
    slug: 'divine-smite',
    category: 'active',
    narrative: 'Gasta spell slot pós-hit melee pra +2d8 radiant (+1d8 por slot).',
    tactical: 9,
    recharge: 'none',
  },

  // ── DRUID ───────────────────────────────────────────────────────────
  {
    slug: 'wild-shape',
    category: 'resource',
    narrative: 'Bonus action — transforma em beast CR≤cap (XPHB: short rest).',
    tactical: 10,
    recharge: 'short',
    charges: { max: 2, formula: 'L20 Archdruid = ilimitado' },
  },
  {
    slug: 'archdruid',
    category: 'capstone',
    narrative: 'L20: Wild Shape ilimitado + componentes V/M desnecessários em spells primais.',
    tactical: 9,
    recharge: 'none',
  },
  {
    slug: 'druid-timeless-body',
    category: 'capstone',
    narrative: 'Envelhece 1 ano a cada 10 anos reais — imune a envelhecer magicamente.',
    tactical: 2,
    recharge: 'none',
  },

  // ── MONK ────────────────────────────────────────────────────────────
  {
    slug: 'martial-arts',
    category: 'passive',
    narrative: 'Unarmed strike usa d4→d10 por nível + DEX opcional.',
    tactical: 7,
    recharge: 'none',
  },
  {
    slug: 'flurry-of-blows',
    category: 'resource',
    narrative: 'Bonus action — 2 unarmed strikes pós Attack action (1 ki/focus).',
    tactical: 8,
    recharge: 'short',
    charges: { max: null, formula: 'usa pool Ki/Focus' },
  },
  {
    slug: 'ki',
    category: 'resource',
    narrative: 'Pool de pontos místicos para features Monk (recarga descanso curto).',
    tactical: 9,
    recharge: 'short',
    charges: { max: null, formula: 'monkLevel' },
  },

  // ── ROGUE ───────────────────────────────────────────────────────────
  {
    slug: 'sneak-attack',
    category: 'resource',
    narrative: 'Extra dmg (1d6→10d6 por nível) 1×/turno com advantage ou aliado adjacente.',
    tactical: 10,
    recharge: 'turn',
    charges: { max: 1 },
  },
  {
    slug: 'cunning-action',
    category: 'active',
    narrative: 'Bonus action — Dash, Disengage ou Hide.',
    tactical: 8,
    recharge: 'turn',
  },

  // ── SORCERER ────────────────────────────────────────────────────────
  {
    slug: 'font-of-magic',
    category: 'resource',
    narrative: 'Pool de Sorcery Points para converter slots e metamagic.',
    tactical: 9,
    recharge: 'long',
    charges: { max: null, formula: 'sorcererLevel' },
  },

  // ── WIZARD ──────────────────────────────────────────────────────────
  {
    slug: 'arcane-recovery',
    category: 'resource',
    narrative: 'Short rest 1/dia — recupera slots somando ≤ ceil(wizLevel/2).',
    tactical: 7,
    recharge: 'long',
    charges: { max: 1 },
  },
];

export class SeedFeatureCategoryOverrides1777310000000
  implements MigrationInterface
{
  name = 'SeedFeatureCategoryOverrides1777310000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const o of OVERRIDES) {
      await queryRunner.query(
        `UPDATE features
         SET category=$2,
             narrative_descriptor=$3,
             tactical_value=$4,
             recharge_rule=$5,
             resource_charges=$6::jsonb
         WHERE slug=$1`,
        [
          o.slug,
          o.category,
          o.narrative,
          o.tactical,
          o.recharge,
          o.charges ? JSON.stringify(o.charges) : null,
        ],
      );

      // Também popula variants XPHB 2024 com sufixo -<classe>-<level> que
      // ainda apontam pro canonical. Ex: 'action-surge-fighter-2' existe
      // mas é mesmo canonical. A classificação in-code já dedupa via alias,
      // mas a aba Traços (que mostra TODAS as features do PC) beneficia
      // do override aplicado a cada variant.
      await queryRunner.query(
        `UPDATE features
         SET category=$2,
             narrative_descriptor=$3,
             tactical_value=$4,
             recharge_rule=$5,
             resource_charges=$6::jsonb
         WHERE slug LIKE $1 || '-%'
           AND (category IS NULL OR narrative_descriptor IS NULL)`,
        [
          o.slug,
          o.category,
          o.narrative,
          o.tactical,
          o.recharge,
          o.charges ? JSON.stringify(o.charges) : null,
        ],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const slugs = OVERRIDES.map((o) => o.slug);
    const placeholders = slugs.map((_, i) => `$${i + 1}`).join(',');
    await queryRunner.query(
      `UPDATE features
       SET category=NULL,
           narrative_descriptor=NULL,
           tactical_value=NULL,
           recharge_rule=NULL,
           resource_charges=NULL
       WHERE slug IN (${placeholders})
          OR (${slugs.map((_, i) => `slug LIKE $${i + 1} || '-%'`).join(' OR ')})`,
      [...slugs],
    );
  }
}
