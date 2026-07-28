import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from "@nestjs/common";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { Observable } from "rxjs";
import { mergeMap } from "rxjs/operators";
import {
  beginDiceRollTrace,
  readDiceRollTrace,
} from "src/common/dice/dice-roll-trace.context";
import { RealtimeService } from "src/realtime/realtime.service";
import { ClientIdContext } from "src/common/http/client-id.context";
import { CommandSnapshotService } from "../services/command-snapshot.service";

/**
 * Faz TODO comando de encontro devolver o estado novo já pronto, e empurra o
 * mesmo estado para os outros clientes da sala.
 *
 * Antes: 1 clique = POST (esperar) → GET /encounters/:id (esperar) →
 * GET /events + GET /turn. O custo do servidor aparecia duas vezes e os outros
 * jogadores não recebiam nada (attack/damage/heal/move nunca emitiam
 * `encounter:invalidate`).
 *
 * Depois: 1 clique = 1 POST que já volta com `snapshot`, e os demais clientes
 * recebem `encounter:snapshot` com o mesmo payload. `originClientId` identifica
 * a origem para os eventos legados; o snapshot é entregue também à própria aba
 * como fallback e deduplicado pelo `at` monotônico.
 *
 * Aditivo por construção: cliente antigo ignora o campo novo e continua
 * refetchando. Por isso backend e frontend podem subir em qualquer ordem.
 */
@Injectable()
export class CommandSnapshotInterceptor implements NestInterceptor {
  constructor(
    private readonly snapshots: CommandSnapshotService,
    private readonly realtime: RealtimeService,
    private readonly clientIdContext: ClientIdContext,
    @Optional() private readonly cls?: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    // Publica no CLS antes do handler para que `emitEncounterInvalidate`, que
    // roda dentro dele, também consiga marcar a aba de origem.
    const originClientId = this.clientIdContext.captureFrom(req);

    const encounterId = resolveMutatedEncounterId(req);
    if (!encounterId) return next.handle();

    if (isVisibleDiceCommand(req)) {
      beginDiceRollTrace(this.cls, {
        encounterId,
        commandId: readDiceCommandId(req),
        visibility: "room",
        rollerParticipantIds: readDiceRollerParticipantIds(req),
      });
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        const diceRolls = readDiceRollTrace(this.cls);
        if (isFailureBody(body)) return body;

        if (diceRolls.length > 0) {
          // É emitido antes do snapshot pesado: a cerimônia começa enquanto o
          // backend ainda monta encontro/turno/timeline. O mesmo lote segue na
          // resposta e no snapshot como fallback e é deduplicado por roll.id.
          this.realtime.emitToRoom(
            `encounter:${encounterId}`,
            "encounter:dice-rolls",
            {
              encounterId,
              originClientId,
              diceRolls,
            },
          );
        }

        if (!isSuccessBody(body)) return body;

        const snapshot = await this.snapshots.build(encounterId);
        if (!snapshot) {
          return diceRolls.length > 0 ? { ...body, diceRolls } : body;
        }

        this.realtime.emitToRoom(
          `encounter:${encounterId}`,
          "encounter:snapshot",
          {
            encounterId,
            originClientId,
            snapshot,
            ...(diceRolls.length > 0 ? { diceRolls } : {}),
          },
        );

        return {
          ...body,
          snapshot,
          ...(diceRolls.length > 0 ? { diceRolls } : {}),
        };
      }),
    );
  }
}

function isSuccessBody(body: unknown): body is Record<string, unknown> {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === true
  );
}

function isFailureBody(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { ok?: unknown }).ok === false
  );
}

function readDiceCommandId(req: Request): string | undefined {
  const raw = req.headers["x-dice-command-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 160 ||
    !/^[a-zA-Z0-9:_-]+$/.test(value)
  ) {
    return undefined;
  }
  return value;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : undefined;
}

function readStringArray(
  value: Record<string, unknown>,
  key: string,
): string[] {
  const candidate = value[key];
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

/**
 * Contexto nominal coarse-grained do comando. O DiceService continua sendo o
 * ponto central das faces; estes ids permitem que o cliente destaque quem está
 * rolando sem acoplar os 120+ call sites de regras à camada de apresentação.
 */
function readDiceRollerParticipantIds(req: Request): string[] {
  const paths = requestRoutePaths(req);
  const path = paths[0] ?? "";
  const rawBody: unknown = req.body;
  const body = isUnknownRecord(rawBody) ? rawBody : {};
  const params = isUnknownRecord(req.params) ? req.params : {};

  const pathParticipantId = readString(params, "participantId");
  if (path.includes("/death-save/") && pathParticipantId) {
    return [pathParticipantId];
  }

  if (path.endsWith("/aoe-action")) {
    const affected = readStringArray(body, "affectedParticipantIds");
    if (affected.length > 0) return [...new Set(affected)];
  }

  if (path.endsWith("/damage") || path.endsWith("/apply-damage")) {
    const target = readString(body, "targetParticipantId");
    return target ? [target] : [];
  }

  const primary =
    readString(body, "attackerParticipantId") ??
    readString(body, "casterParticipantId") ??
    readString(body, "participantId") ??
    readString(body, "reactorParticipantId") ??
    pathParticipantId;
  const targets =
    path.endsWith("/cast-spell") || path.includes("/spells/")
      ? [
          ...readStringArray(body, "targetParticipantIds"),
          ...readStringArray(body, "affectedParticipantIds"),
        ]
      : [];

  return [...new Set([primary, ...targets].filter((id): id is string => !!id))];
}

/**
 * Fail-closed: apenas comandos cujo dado já é informação pública da batalha
 * entram no canal da sala. Preparação de encontro (incluindo HP de monstros),
 * mapa, convites e posicionamento nunca iniciam trace compartilhado.
 */
function isVisibleDiceCommand(req: Request): boolean {
  return requestRoutePaths(req).some((path) =>
    VISIBLE_DICE_COMMAND_PATHS.some((pattern) => pattern.test(path)),
  );
}

const VISIBLE_DICE_COMMAND_PATHS = [
  /^(?:game\/)?encounters\/:id\/(?:roll-initiative|start|talk-down|resolve|aoe-action|volley|attack|apply-damage|damage|heal|end-turn|ai-turn|generic-action|class-feature|cast-spell|opportunity-attack|move|dash|disengage|ready-action|stand-up)$/,
  /^(?:game\/)?encounters\/:id\/death-save\/:participantId$/,
  /^(?:game\/)?encounters\/:id\/spells\/.+$/,
  /^(?:game\/)?encounters\/:id\/participants\/:participantId\/(?:concentration\/drop|revert-transformation|stroke-of-luck\/arm|holy-nimbus|eldritch-master|fighting-style\/.+|tactical-mind|maneuver\/.+|cleric\/.+|paladin\/.+|berserker\/.+|brutal-strike\/.+|relentless-rage|indomitable-might|wild-shape\/.+)$/,
  /^(?:game\/)?encounters\/:id\/steed\/gift$/,
];

function requestRoutePaths(req: Request): string[] {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  const rawPaths = Array.isArray(routePath)
    ? routePath
    : [routePath ?? req.path ?? ""];
  return rawPaths
    .filter((path): path is string => typeof path === "string")
    .map((path) => path.replace(/^\/+/, "").replace(/\/+$/, ""));
}

/**
 * Só mutações de encontro. GET nunca paga o custo, e rotas fora de
 * `encounters/:id` passam direto.
 */
function resolveMutatedEncounterId(req: Request): string | null {
  if (req.method === "GET" || req.method === "HEAD") return null;
  if (!requestRoutePaths(req).some((path) => path.includes("encounters/:id"))) {
    return null;
  }
  const id = (req.params as Record<string, string> | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
