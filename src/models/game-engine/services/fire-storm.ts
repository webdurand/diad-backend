export interface FireStormOrigin {
  x: number;
  y: number;
}

export type FireStormLayoutResult =
  | { ok: true; origins: FireStormOrigin[] }
  | {
      ok: false;
      message: string;
      code:
        | "INVALID_ACTION"
        | "POSITION_OUT_OF_BOUNDS"
        | "SPELL_OUT_OF_RANGE";
    };

export function validateFireStormLayout(
  rawOrigins: FireStormOrigin[],
  options: {
    columns: number;
    rows: number;
    caster?: FireStormOrigin | null;
  },
): FireStormLayoutResult {
  const origins = rawOrigins.map((origin) => ({
    x: Math.trunc(origin.x),
    y: Math.trunc(origin.y),
  }));
  if (origins.length < 1 || origins.length > 10) {
    return {
      ok: false,
      message: "Fire Storm exige de 1 a 10 cubos de 10 pés.",
      code: "INVALID_ACTION",
    };
  }

  const occupiedCells = new Set<string>();
  for (const origin of origins) {
    if (
      origin.x < 0 ||
      origin.y < 0 ||
      origin.x + 1 >= options.columns ||
      origin.y + 1 >= options.rows
    ) {
      return {
        ok: false,
        message: "Cada cubo de Fire Storm precisa caber inteiramente no mapa.",
        code: "POSITION_OUT_OF_BOUNDS",
      };
    }
    if (
      options.caster &&
      Math.max(
        Math.abs(origin.x - options.caster.x),
        Math.abs(origin.y - options.caster.y),
      ) *
        5 >
        150
    ) {
      return {
        ok: false,
        message: "Todos os cubos de Fire Storm precisam estar a até 150 pés.",
        code: "SPELL_OUT_OF_RANGE",
      };
    }
    for (let dx = 0; dx <= 1; dx += 1) {
      for (let dy = 0; dy <= 1; dy += 1) {
        const key = `${origin.x + dx},${origin.y + dy}`;
        if (occupiedCells.has(key)) {
          return {
            ok: false,
            message: "Os cubos de Fire Storm não podem se sobrepor.",
            code: "INVALID_ACTION",
          };
        }
        occupiedCells.add(key);
      }
    }
  }

  const connectedIndexes = new Set<number>([0]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (let index = 0; index < origins.length; index += 1) {
      if (connectedIndexes.has(index)) continue;
      const origin = origins[index];
      const touchesConnectedCube = Array.from(connectedIndexes).some(
        (connectedIndex) => {
          const connected = origins[connectedIndex];
          const dx = Math.abs(origin.x - connected.x);
          const dy = Math.abs(origin.y - connected.y);
          return (dx === 2 && dy === 0) || (dy === 2 && dx === 0);
        },
      );
      if (touchesConnectedCube) {
        connectedIndexes.add(index);
        expanded = true;
      }
    }
  }
  if (connectedIndexes.size !== origins.length) {
    return {
      ok: false,
      message:
        "Cada cubo de Fire Storm deve compartilhar uma face com outro cubo.",
      code: "INVALID_ACTION",
    };
  }

  return { ok: true, origins };
}
