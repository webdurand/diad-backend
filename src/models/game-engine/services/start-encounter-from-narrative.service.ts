/**
 * Spec 020 — start_encounter_from_narrative.
 *
 * Orquestra a transição narrativa → combate formal.
 *
 * Fluxo:
 *   1. Valida sceneId existe na session.
 *   2. Para cada NPC alvo: valida existe + tem monsterId (sem stats não pode lutar).
 *   3. Cria EncounterEntity (auto-attach PCs já incluso em EncounterService.create).
 *   4. Materializa NPC participants (type='npc', monsterId, hp do monster).
 *   5. Auto-place tokens em grid (linha por linha, top-left).
 *   6. Inicia combate (turn order por initiative).
 *   7. Aplica condition `surprised` nos NPCs alvos quando surprise_round=true (RAW 2024).
 *   8. Emite EncounterEvent.encounter_started.
 *
 * Idempotência: parcial. Cada step é atômico, mas se step 5/6/7 falham depois
 * do encounter ser criado, ele permanece em status='preparing' (consistente
 * com o resto do código). Caller pode retentar place_tokens manualmente.
 */

import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SceneEntity } from "src/entities/scene.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { EncounterService } from "./encounter.service";
import { CombatService } from "./combat.service";
import { DiceService } from "./dice.service";
import { NpcService } from "src/models/world/services/npc.service";
import { SceneContextService } from "src/models/session/services/scene-context.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { getAbilityModifier } from "src/shared/srd-utils";

/** UUID v4-ish detection — distingue UUID de nome livre nos targets. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extrai descritor do alvo a partir do label da choice clicada (ex:
 * "Atacar o homem grande de primeira" → "homem grande"). Heurística:
 * remove verbo de ataque inicial, artigos e modificadores de ordem,
 * mantém núcleo nominal. Quando não consegue isolar, devolve trigger
 * inteiro pra o archetype-picker tentar matchear keywords.
 */
const TRIGGER_VERB_RE =
  /^\s*(atacar|ataco|ataca|atacando|lutar|luto|luta|brigar|brigo|briga|agredir|agrido|agride|investir contra|investe contra|enfrentar|enfrento|enfrenta|matar|mato|mata)\s+/i;
const TRIGGER_ARTICLE_RE = /^\s*(o|a|os|as|um|uma|uns|umas|aquele|aquela)\s+/i;
const TRIGGER_TAIL_RE =
  /\s+(de\s+(primeira|primeiro|imediato|im[eé]diato|repente)|primeiro|primeira|agora|j[áa]|aqui|l[áa])\s*$/i;

function extractTargetDescriptor(trigger: string): string {
  const raw = (trigger ?? "").trim();
  if (!raw) return "";

  let stripped = raw.replace(TRIGGER_VERB_RE, "");
  stripped = stripped.replace(TRIGGER_ARTICLE_RE, "");
  stripped = stripped.replace(TRIGGER_TAIL_RE, "");
  stripped = stripped.replace(/[!.?]+$/, "").trim();

  if (stripped.length >= 2 && stripped.length <= 60) return stripped;
  return raw.length <= 60 ? raw : raw.slice(0, 60);
}

export interface TokenLayoutEntry {
  /** characterId (PC) ou npcId — backend resolve pra participantId. */
  ref: string;
  x: number;
  y: number;
  reason?: string;
}

export interface StartEncounterFromNarrativeInput {
  sessionId: string;
  /** Quando ausente, backend resolve via active OU cria stub auto. */
  sceneId?: string;
  attackerParticipantId?: string | null;
  /**
   * NPC UUIDs já materializados (path otimizado — PreFlightOracle resolveu
   * placeholders via materializations sequenciais). Mantido pra back-compat.
   */
  targetNpcIds?: string[];
  /**
   * Lista mista UUID + nome livre. Backend detecta por elemento: UUID carrega
   * NpcEntity, nome materializa stub via archetype heurístico. Quando ambos
   * `targetNpcIds` e `targets` são passados, são merged.
   */
  targets?: string[];
  surpriseRound?: boolean;
  autoPlaceTokens?: boolean;
  narrativeTrigger?: string;
  campaignId?: string;
  ownerUserId: string;
  traceId?: string;
  /** Spec 026 Pillar 4 — layout sugerido pelo agente (oracle). */
  tokensLayout?: TokenLayoutEntry[];
}

export interface StartEncounterFromNarrativeResult {
  encounterId: string;
  participantIds: string[];
  turnOrder: string[];
  currentParticipantId: string;
  round: number;
  surprised: string[];
}

@Injectable()
export class StartEncounterFromNarrativeService {
  private readonly logger = new Logger(StartEncounterFromNarrativeService.name);

  constructor(
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly encounterService: EncounterService,
    private readonly combatService: CombatService,
    private readonly diceService: DiceService,
    private readonly npcService: NpcService,
    private readonly sceneContextService: SceneContextService,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async run(
    input: StartEncounterFromNarrativeInput,
  ): Promise<StartEncounterFromNarrativeResult> {
    // 1. Resolve cena (combate é prioridade — nunca falha por scene ausente).
    //    Ordem: sceneId explícito → active scene da session → cria stub auto.
    const scene = await this.resolveOrCreateScene(input);
    const resolvedSceneId = scene.id;

    // 2. Resolve targets mistos (UUID + nome). Nomes materializam stub via
    // NpcService com archetype heurístico.
    let resolvedIds = await this.resolveOrMaterializeTargets(
      input.targetNpcIds ?? [],
      input.targets ?? [],
      input.campaignId ?? null,
    );

    // 2.5. Fallback do botão "Iniciar combate": quando frontend envia request
    // sem targets, primeiro tenta npcsPresent da cena (hostis primeiro;
    // figurantes auto-materializados ficam neutral, então caem no segundo).
    if (resolvedIds.length === 0) {
      const sceneCtx = await this.sceneContextService.assembleContext(scene.id);
      const hostiles = sceneCtx.npcsPresent.filter(
        (n) => n.disposition === "hostile",
      );
      const fallback = hostiles.length > 0 ? hostiles : sceneCtx.npcsPresent;
      resolvedIds = fallback.map((n) => n.id);
    }

    // 2.6. Último recurso: NPCs que vivem só na prosa do Narrator (não
    // materializados em scene_npcs). Extrai descritor do narrativeTrigger
    // (label da choice clicada — ex: "Atacar o homem grande") e cria stub.
    if (resolvedIds.length === 0 && input.narrativeTrigger && input.campaignId) {
      const descriptor = extractTargetDescriptor(input.narrativeTrigger);
      if (descriptor) {
        try {
          const stub = await this.npcService.materializeStubFromName(
            input.campaignId,
            descriptor,
            input.narrativeTrigger,
            "hostile",
          );
          resolvedIds = [stub.id];
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `materialize from narrativeTrigger '${descriptor}' falhou: ${msg}`,
          );
        }
      }
    }

    if (resolvedIds.length === 0) {
      throw new DomainException(
        ErrorCode.ENCOUNTER_NO_TARGETS_IN_SCENE,
        "Nenhum oponente identificado na cena.",
        {
          context: { sessionId: input.sessionId, sceneId: resolvedSceneId },
          hint: "Descreva quem você ataca via free-text antes de iniciar combate.",
        },
      );
    }

    const npcs = await this.loadAndValidateNpcs(resolvedIds);

    // 3. Cria encounter (auto-anexa PCs da session/campaign)
    let encounter;
    try {
      encounter = await this.encounterService.create(
        input.sessionId,
        { name: input.narrativeTrigger ?? "Combate narrativo" },
        input.ownerUserId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainException(
        ErrorCode.ENCOUNTER_CREATE_FAILED,
        `Falha ao criar encounter: ${msg}`,
        {
          context: { sessionId: input.sessionId, sceneId: resolvedSceneId },
          cause: err,
        },
      );
    }

    // 4. Materializa NPC participants (type='npc', monsterId, hp do monster).
    // Não há método dedicado no EncounterService para "anexar NPC nomeado":
    // addMonster cria participants type='monster' sem ligação ao NpcEntity.
    // Inline aqui — pequena divergência: type='npc' + monsterId (stats vêm do monster
    // cacheado), permitindo que o agente saiba que é um NPC nomeado da campanha.
    const npcParticipants = await this.materializeNpcParticipants(
      encounter.id,
      npcs,
    );

    // Refresh encounter pra ter PCs + NPCs juntos.
    encounter = await this.encounterService.getById(encounter.id);
    const allParticipants = encounter.participants ?? [];

    // 5. Auto place tokens (default true)
    const shouldPlace = input.autoPlaceTokens !== false;
    if (shouldPlace) {
      try {
        await this.placeTokens(
          encounter.id,
          allParticipants,
          encounter,
          input.tokensLayout,
          npcs,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new DomainException(
          ErrorCode.PARTICIPANT_PLACEMENT_FAILED,
          `Auto-placement falhou: ${msg}`,
          {
            context: {
              encounterId: encounter.id,
              needed: allParticipants.length,
            },
            hint: "Tente com auto_place_tokens=false e chame place_tokens manualmente.",
            cause: err,
          },
        );
      }
    }

    // 6. Roll initiative + start combat
    await this.rollInitiative(allParticipants, input.surpriseRound === true, npcParticipants);
    encounter = await this.encounterService.startCombat(encounter.id);

    // 7. Aplica `surprised` em NPCs (best-effort)
    const surprisedIds: string[] = [];
    if (input.surpriseRound === true) {
      for (const np of npcParticipants) {
        try {
          await this.combatService.applyCondition(encounter.id, {
            participantId: np.id,
            condition: "surprised",
            apply: true,
            ownerUserId: input.ownerUserId,
          });
          surprisedIds.push(np.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `surprised condition skipped npcParticipant=${np.id}: ${msg}`,
          );
        }
      }
    }

    // 8. Emite event encounter_started (best-effort se faltar campaignId).
    const campaignId = await this.resolveCampaignId(
      input.campaignId,
      input.sessionId,
    );
    if (campaignId) {
      try {
        const envelope = this.factory.build({
          eventCategory: "EncounterEvent",
          eventType: "encounter_started",
          source: {
            service: "diad-backend",
            module: "StartEncounterFromNarrativeService.run",
            traceId: input.traceId,
          },
          scope: {
            campaignId,
            sessionId: input.sessionId,
            sceneId: resolvedSceneId,
            encounterId: encounter.id,
          },
          payload: {
            encounterId: encounter.id,
            sceneId: resolvedSceneId,
            triggerSource: "narrative",
            attackerParticipantId: input.attackerParticipantId ?? null,
            surprised: surprisedIds,
            narrativeTrigger: input.narrativeTrigger ?? null,
          },
          narrativeDescriptor:
            input.narrativeTrigger ??
            `Combate iniciado: ${npcParticipants.length} hostil(is).`,
        });
        await this.eventBus.publish(envelope);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`encounter_started publish skipped: ${msg}`);
      }
    }

    const turnOrder = encounter.turnOrder ?? [];
    return {
      encounterId: encounter.id,
      participantIds: (encounter.participants ?? []).map((p) => p.id),
      turnOrder,
      currentParticipantId: turnOrder[0] ?? "",
      round: encounter.currentRound ?? 1,
      surprised: surprisedIds,
    };
  }

  // --- helpers ---

  /**
   * Resolve scene em ordem de preferência:
   *   1. sceneId explícito do input → valida existe + pertence à session
   *   2. Active scene da session (isActive=true)
   *   3. Cria scene stub auto (campanhas custom sem world building formal)
   *
   * Combate é prioridade — nunca falha aqui. Sempre retorna SceneEntity válida.
   */
  private async resolveOrCreateScene(
    input: StartEncounterFromNarrativeInput,
  ): Promise<SceneEntity> {
    if (input.sceneId) {
      const scene = await this.sceneRepo.findOne({
        where: { id: input.sceneId },
      });
      if (!scene || scene.sessionId !== input.sessionId) {
        throw new DomainException(
          ErrorCode.SCENE_NOT_FOUND,
          `Cena ${input.sceneId} não encontrada na sessão ${input.sessionId}.`,
          {
            context: { sceneId: input.sceneId, sessionId: input.sessionId },
            hint: "Cena pode ter sido encerrada — chamar get_active_scene.",
          },
        );
      }
      return scene;
    }

    const active = await this.sceneRepo.findOne({
      where: { sessionId: input.sessionId, isActive: true },
    });
    if (active) return active;

    const nextNumber =
      ((
        await this.sceneRepo.count({
          where: { sessionId: input.sessionId },
        })
      ) ?? 0) + 1;

    const stub = this.sceneRepo.create({
      sessionId: input.sessionId,
      sceneNumber: nextNumber,
      title: input.narrativeTrigger ?? "Combate iminente",
      description: "Cena criada automaticamente para hospedar combate.",
      isActive: true,
    });
    const saved = await this.sceneRepo.save(stub);
    this.logger.log(
      `auto_scene_stub_created session=${input.sessionId} scene=${saved.id}`,
    );
    return saved;
  }

  /**
   * Resolve lista mista (UUID + name) para lista de UUIDs. UUIDs passam direto.
   * Nomes resolvem via `findByNameInCampaign`; se não acharem, materializam
   * stub auto via archetype heurístico.
   */
  private async resolveOrMaterializeTargets(
    uuidTargets: string[],
    mixedTargets: string[],
    campaignId: string | null,
  ): Promise<string[]> {
    const resolved: string[] = [...uuidTargets];

    for (const raw of mixedTargets) {
      const candidate = (raw || "").trim();
      if (!candidate) continue;

      if (UUID_REGEX.test(candidate)) {
        resolved.push(candidate);
        continue;
      }

      // É nome livre — precisa de campaignId pra resolver/materializar
      if (!campaignId) {
        this.logger.warn(
          `target name '${candidate}' sem campaignId; pulando.`,
        );
        continue;
      }

      try {
        const stub = await this.npcService.materializeStubFromName(
          campaignId,
          candidate,
          undefined,
          "hostile",
        );
        resolved.push(stub.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `auto-materialize falhou pra '${candidate}': ${msg}`,
        );
      }
    }
    return resolved;
  }

  private async loadAndValidateNpcs(npcIds: string[]): Promise<NpcEntity[]> {
    const npcs: NpcEntity[] = [];
    for (const npcId of npcIds) {
      const npc = await this.npcRepo.findOne({
        where: { id: npcId },
        relations: ["monster"],
      });
      if (!npc) {
        throw new DomainException(
          ErrorCode.NPC_NOT_HOSTILE_CAPABLE,
          `NPC ${npcId} não encontrado.`,
          {
            context: { npcId },
            hint: "Verifique se o NPC existe na campanha.",
          },
        );
      }
      if (!npc.monsterId) {
        throw new DomainException(
          ErrorCode.NPC_NOT_HOSTILE_CAPABLE,
          `NPC '${npc.name}' não tem stats (monsterId ausente).`,
          {
            context: { npcId, name: npc.name },
            hint: "Use create_npc_from_narrative para aplicar default por role_hint.",
          },
        );
      }
      npcs.push(npc);
    }
    return npcs;
  }

  private async materializeNpcParticipants(
    encounterId: string,
    npcs: NpcEntity[],
  ): Promise<EncounterParticipantEntity[]> {
    const participants: EncounterParticipantEntity[] = [];
    for (const npc of npcs) {
      const monster = npc.monster
        ? npc.monster
        : await this.monsterRepo.findOne({
            where: { id: npc.monsterId! },
          });
      if (!monster) {
        throw new DomainException(
          ErrorCode.NPC_NOT_HOSTILE_CAPABLE,
          `Monster ${npc.monsterId} (vinculado ao NPC '${npc.name}') não encontrado.`,
          { context: { npcId: npc.id, monsterId: npc.monsterId } },
        );
      }

      let hp = monster.hit_points;
      if (monster.hit_points_roll) {
        try {
          const rolled = this.diceService.rollExpression(monster.hit_points_roll);
          hp = Math.max(1, rolled.total);
        } catch {
          /* fallback to monster.hit_points */
        }
      }
      const dexMod = getAbilityModifier(monster.dexterity);
      const participant = this.participantRepo.create({
        encounterId,
        type: "npc",
        monsterId: monster.id,
        displayName: npc.name,
        initiativeModifier: dexMod,
        currentHp: hp,
        maxHp: hp,
        tempHp: 0,
        conditions: [],
        isDefeated: false,
        faction: "enemy",
        // Spec 027 (M2 follow-up) — NPCs hostis criados via narrative em
        // DIAD solo são controlados pela IA. Antes vinha 'dm' (assumia DM
        // humano), causando turno NPC parado esperando input do player.
        // Frontend ([sessao/page.tsx:510-522]) auto-dispatcha POST /ai-turn
        // quando current participant tem controlledBy='ai' → AiTurnService
        // → /monsters/decide no agno (rule-based / utility / LLM por INT).
        controlledBy: "ai",
      });
      const saved = await this.participantRepo.save(participant);
      participants.push(saved);
    }
    return participants;
  }

  /**
   * Spec 026 Pillar 4 — aplica layout proposto pelo agente narrativo quando
   * existe e auto-completa o resto via grid top-left.
   *
   * Resolução de `ref`: tenta como `npcId` (com base nos NPCs hostis criados
   * neste encounter) → cai pra `characterId` do participant (PCs já anexados
   * pelo `EncounterService.create`). Refs sem match e coords fora do grid
   * são descartadas sem erro — auto-grid cobre a lacuna.
   */
  private async placeTokens(
    encounterId: string,
    participants: EncounterParticipantEntity[],
    encounter: { mapData?: { gridColumns?: number; gridRows?: number; gridSize?: number } },
    layout: TokenLayoutEntry[] | undefined,
    npcs: NpcEntity[],
  ): Promise<void> {
    const gridColumns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 10;
    const gridRows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 10;

    const occupied = new Set<string>();
    for (const p of participants) {
      if (p.positionX != null && p.positionY != null) {
        occupied.add(`${p.positionX},${p.positionY}`);
      }
    }

    const positions: Array<{ participantId: string; x: number; y: number }> = [];

    // Resolver ref (npcId | characterId) → participantId.
    const npcIdToParticipantId = new Map<string, string>();
    for (const np of npcs) {
      const part = participants.find(
        (p) => p.type === "npc" && p.monsterId === np.monsterId,
      );
      if (part) npcIdToParticipantId.set(np.id, part.id);
    }
    const charIdToParticipantId = new Map<string, string>();
    for (const p of participants) {
      if (p.type === "pc" && p.characterId) {
        charIdToParticipantId.set(p.characterId, p.id);
      }
    }
    const resolveRef = (ref: string): string | null =>
      npcIdToParticipantId.get(ref) ?? charIdToParticipantId.get(ref) ?? null;

    const placedParticipantIds = new Set<string>();
    if (layout && layout.length > 0) {
      for (const entry of layout) {
        if (
          !Number.isInteger(entry.x) ||
          !Number.isInteger(entry.y) ||
          entry.x < 0 ||
          entry.y < 0 ||
          entry.x >= gridColumns ||
          entry.y >= gridRows
        ) {
          continue;
        }
        const cellKey = `${entry.x},${entry.y}`;
        if (occupied.has(cellKey)) continue;
        const participantId = resolveRef(entry.ref);
        if (!participantId) continue;
        if (placedParticipantIds.has(participantId)) continue;
        positions.push({ participantId, x: entry.x, y: entry.y });
        occupied.add(cellKey);
        placedParticipantIds.add(participantId);
      }
    }

    let cursorX = 0;
    let cursorY = 0;

    const advance = (): boolean => {
      cursorX++;
      if (cursorX >= gridColumns) {
        cursorX = 0;
        cursorY++;
      }
      return cursorY < gridRows;
    };

    for (const p of participants) {
      if (p.positionX != null && p.positionY != null) continue; // já posicionado
      if (placedParticipantIds.has(p.id)) continue; // posicionado pelo layout

      while (occupied.has(`${cursorX},${cursorY}`)) {
        if (!advance()) {
          throw new Error(
            `Grid ${gridColumns}x${gridRows} cheio (occupied=${occupied.size}, needed=${participants.length}).`,
          );
        }
      }
      positions.push({ participantId: p.id, x: cursorX, y: cursorY });
      occupied.add(`${cursorX},${cursorY}`);
      if (!advance() && positions.length < participants.length) {
        // só erra se ainda há quem precise posicionar
        const stillNeed = participants.length - positions.length;
        if (stillNeed > 0) {
          throw new Error(
            `Grid ${gridColumns}x${gridRows} cheio (occupied=${occupied.size}, needed=${participants.length}).`,
          );
        }
      }
    }

    if (positions.length === 0) return;
    await this.encounterService.batchUpdatePositions(encounterId, positions);
  }

  /**
   * Rola initiative pra cada participant. Aplica Disadvantage nos NPCs surpresos
   * (RAW 2024 Surprised condition: Disadvantage on initiative roll).
   */
  private async rollInitiative(
    participants: EncounterParticipantEntity[],
    surpriseRound: boolean,
    surprisedNpcs: EncounterParticipantEntity[],
  ): Promise<void> {
    const surprisedIds = new Set(surprisedNpcs.map((p) => p.id));
    for (const p of participants) {
      if (p.initiativeTotal != null) continue; // já rolada
      const mod = p.initiativeModifier ?? 0;
      const disadvantage = surpriseRound && surprisedIds.has(p.id);
      const roll = disadvantage
        ? Math.min(this.d20(), this.d20())
        : this.d20();
      const total = roll + mod;
      await this.encounterService.setManualInitiative(p.id, total);
    }
  }

  private d20(): number {
    try {
      return this.diceService.rollExpression("1d20").total;
    } catch {
      return Math.floor(Math.random() * 20) + 1;
    }
  }

  private async resolveCampaignId(
    explicit: string | undefined,
    sessionId: string,
  ): Promise<string | undefined> {
    if (explicit) return explicit;
    const session = await this.sessionRepo
      .findOne({ where: { id: sessionId } })
      .catch(() => null);
    return session?.campaignId ?? undefined;
  }
}
