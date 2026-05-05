import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LocationEntity } from "src/entities/location.entity";
import { AuthGuard } from "src/models/auth/auth.guard";
import { CampaignIdPipe } from "src/models/world/pipes/campaign-id.pipe";
import {
  Difficulty,
  LocationType,
  MonsterSelectorService,
} from "../services/monster-selector.service";
import { RandomEncounterMaterializerService } from "../services/random-encounter-materializer.service";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

interface AuthRequest extends Request {
  user?: { id: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuário não autenticado.");
  return id;
}

function extractTraceId(traceparent?: string): string | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split("-");
  if (parts.length < 4) return undefined;
  const traceId = parts[1];
  return /^[0-9a-f]{32}$/.test(traceId) ? traceId : undefined;
}

interface PreviewBody {
  sessionId: string;
  locationId?: string;
  partyAvgLevel: number;
  partySize: number;
  targetDifficulty: Difficulty;
  recentAnchors?: string[];
}

interface MaterializeBody {
  sessionId: string;
  sceneId?: string;
  monsterSlugs: string[];
  partyAvgLevel: number;
  difficulty: Difficulty;
  biome?: string;
  reasonChain?: string[];
}

const ELIGIBLE_TYPES: ReadonlyArray<LocationType> = [
  "wilderness",
  "dungeon",
  "dungeon_room",
];

@Controller("campaigns")
@UseGuards(AuthGuard)
export class RandomEncounterController {
  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly selector: MonsterSelectorService,
    private readonly materializer: RandomEncounterMaterializerService,
  ) {}

  @Post(":id/random-encounter/preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: PreviewBody,
  ) {
    let location: LocationEntity | null = null;
    let locationType: LocationType = "wilderness";
    let biomeTags: string[] | undefined;

    if (body.locationId) {
      location = await this.locationRepo.findOne({
        where: { id: body.locationId, campaignId },
      });
      if (!location) {
        throw new DomainException(
          ErrorCode.LOCATION_NOT_FOUND,
          `Location ${body.locationId} não encontrada na campanha.`,
        );
      }
      if (!ELIGIBLE_TYPES.includes(location.type as LocationType)) {
        throw new DomainException(
          ErrorCode.RANDOM_ENCOUNTER_INVALID_LOCATION,
          `Tipo '${location.type}' não suporta random encounter.`,
        );
      }
      locationType = location.type as LocationType;
      biomeTags = Array.isArray(location.tags) ? location.tags : undefined;
    }

    const composition = await this.selector.selectComposition({
      partyAvgLevel: body.partyAvgLevel,
      partySize: body.partySize,
      biomeTags,
      locationType,
      targetDifficulty: body.targetDifficulty,
      recentAnchors: body.recentAnchors,
    });

    if (!composition) {
      throw new DomainException(
        ErrorCode.RANDOM_ENCOUNTER_POOL_EMPTY,
        "Nenhum monstro elegível encontrado pro encontro aleatório.",
        {
          context: {
            campaignId,
            locationType,
            biomeTags,
            partyAvgLevel: body.partyAvgLevel,
          },
        },
      );
    }

    return {
      monsterSlugs: composition.monsterSlugs,
      displayNames: composition.displayNames,
      anchor: composition.anchor,
      mode: composition.mode,
      adjustedXp: composition.adjustedXp,
      reasonChain: composition.reasonChain,
      biome: biomeTags?.[0] ?? null,
      difficulty: body.targetDifficulty,
      locationType,
    };
  }

  @Post(":id/random-encounter")
  @HttpCode(HttpStatus.CREATED)
  async materialize(
    @Param("id", CampaignIdPipe) campaignId: string,
    @Body() body: MaterializeBody,
    @Req() req: AuthRequest,
    @Headers("traceparent") traceparent?: string,
  ) {
    const ownerUserId = getUserId(req);
    const traceId = extractTraceId(traceparent);

    return this.materializer.materialize({
      campaignId,
      sessionId: body.sessionId,
      sceneId: body.sceneId,
      monsterSlugs: body.monsterSlugs,
      ownerUserId,
      partyAvgLevel: body.partyAvgLevel,
      difficulty: body.difficulty,
      biome: body.biome,
      reasonChain: body.reasonChain,
      traceId,
    });
  }
}
