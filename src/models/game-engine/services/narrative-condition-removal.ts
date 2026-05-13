import type { ConditionSlug } from "../interfaces/combat.interfaces";



export type RemovalReason =
  | "hp_restored"
  | "concentration_broken"
  | "target_saved"
  | "duration_expired"
  | "source_ended"
  | "manual"
  | "unknown";

const CONDITION_LABEL_PT: Record<string, string> = {
  blinded: "Cego",
  charmed: "Enfeitiçado",
  deafened: "Surdo",
  exhaustion: "Exausto",
  frightened: "Amedrontado",
  grappled: "Agarrado",
  incapacitated: "Incapacitado",
  invisible: "Invisível",
  paralyzed: "Paralisado",
  petrified: "Petrificado",
  poisoned: "Envenenado",
  prone: "Prono",
  restrained: "Restrito",
  stunned: "Atordoado",
  unconscious: "Inconsciente",
};

const CURATED: Record<string, Partial<Record<RemovalReason, string>>> = {
  unconscious: {
    hp_restored: "Abre os olhos e respira fundo — consciente novamente.",
    target_saved: "Recupera a consciência por força de vontade.",
    duration_expired: "Desperta conforme o efeito se dissipa.",
  },
  "faerie-fire": {
    concentration_broken: "O brilho prateado se dissipa; o feitiço cessa.",
    duration_expired: "A luz mágica apaga gradualmente.",
  },
  bless: {
    concentration_broken: "A bênção divina se esvai.",
    duration_expired: "A inspiração sagrada termina.",
  },
  hex: {
    concentration_broken: "A marca de maldição desvanece do alvo.",
    source_ended: "O pacto com a maldição se quebra.",
  },
  "hunters-mark": {
    concentration_broken: "A marca do caçador desaparece.",
    source_ended: "O foco sobre a presa se perde.",
  },
  "hold-person": {
    concentration_broken: "Os músculos se soltam; a paralisia se quebra.",
    target_saved: "Rompe a paralisia com um tremor violento.",
  },
  charmed: {
    concentration_broken: "A influência mental se dissipa.",
    target_saved: "Resiste e recupera o próprio julgamento.",
    source_ended: "O encanto se quebra.",
  },
  frightened: {
    concentration_broken: "O medo se dissipa junto com o feitiço.",
    target_saved: "Encara o terror e o afasta.",
    source_ended: "A coragem retorna.",
  },
  prone: {
    manual: "Se levanta.",
    hp_restored: "Se ergue ao voltar à consciência.",
  },
  grappled: {
    source_ended: "Se solta da agarra.",
    manual: "Escapa da agarra.",
  },
  blinded: {
    concentration_broken: "A visão retorna enquanto o feitiço cessa.",
    target_saved: "Pisca; a cegueira se dissipa.",
  },
  paralyzed: {
    concentration_broken: "A paralisia cessa com o fim do feitiço.",
    target_saved: "Vence a paralisia com esforço sobre-humano.",
  },
  stunned: {
    duration_expired: "Se recupera do atordoamento.",
    target_saved: "Sacode a cabeça e recobra o foco.",
  },
  poisoned: {
    duration_expired: "O veneno perde efeito.",
    target_saved: "Resiste ao veneno.",
  },
};


export function narrativeForConditionRemoval(
  slug: ConditionSlug | string,
  reason: RemovalReason | string,
): string {
  const key = String(slug).toLowerCase();
  const entry = CURATED[key];
  if (entry && entry[reason as RemovalReason]) {
    return entry[reason as RemovalReason] as string;
  }
  const label = CONDITION_LABEL_PT[key] ?? slug;
  return `${label} termina.`;
}
