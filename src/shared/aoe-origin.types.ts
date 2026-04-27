/**
 * Tipos compartilhados de Área de Efeito (AoE).
 *
 * Contrato canônico em `diad-meta/specs/001-aoe-origin-targeting/contracts/area-effect.contract.ts`.
 * Frontend espelha os mesmos tipos em `diad-frontend/types/aoe.ts`.
 * Duplicação proposital — qualquer divergência entre backend/frontend é bug.
 */

export type AoEOriginType = "self" | "point" | "fixed";

export type AoEShape = "sphere" | "cone" | "line" | "cube" | "cylinder";

export type AoEDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface GridCell {
  col: number;
  row: number;
}

/**
 * Descreve como uma área se projeta no mapa.
 *
 * Invariantes:
 *   - originType === 'point'  ⇒ rangeFt > 0
 *   - originType === 'fixed'  ⇒ fixedOrigin != null
 *   - originType === 'self'   ⇒ rangeFt == 0 (ou ausente) e fixedOrigin == null
 *   - sizeFt > 0 sempre
 */
export interface AreaEffect {
  originType: AoEOriginType;
  shape: AoEShape;
  sizeFt: number;
  rangeFt: number;
  fixedOrigin?: GridCell | null;
}

export interface AoeConfirmation {
  originCell: GridCell;
  direction?: AoEDirection;
  affectedCells: GridCell[];
  affectedParticipantIds: string[];
}
