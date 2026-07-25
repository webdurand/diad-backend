

export type AoEOriginType = "self" | "point" | "fixed";

export type AoEShape = "sphere" | "cone" | "line" | "cube" | "cylinder";

export type AoEDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface GridCell {
  col: number;
  row: number;
}


export interface AreaEffect {
  originType: AoEOriginType;
  shape: AoEShape;
  sizeFt: number;
  rangeFt: number;
  maxPlacements?: number;
  fixedOrigin?: GridCell | null;
  placementOrigin?: GridCell | null;
}

export interface AoeConfirmation {
  originCell: GridCell;
  direction?: AoEDirection;
  affectedCells: GridCell[];
  affectedParticipantIds: string[];
}
