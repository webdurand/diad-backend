export function concentrationMatchesExpiredArea(
  caster: {
    id: string;
    isConcentrating: boolean;
    concentratingOn?: string | null;
  },
  area: {
    casterParticipantId: string | null;
    sourceSpell: string;
    sourceConcentration: boolean;
  },
): boolean {
  const normalize = (value?: string | null) =>
    value?.toLowerCase().replace(/-(phb|xphb|srd52)$/, "") ?? null;
  return (
    area.sourceConcentration &&
    area.casterParticipantId === caster.id &&
    caster.isConcentrating &&
    normalize(caster.concentratingOn) === normalize(area.sourceSpell)
  );
}
