import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { ClockEntity } from "src/entities/clock.entity";
import { SceneEntity } from "src/entities/scene.entity";
import { LocationEntity } from "src/entities/location.entity";
import { WeatherEntity } from "src/entities/weather.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { computeTimeOfDay, TimeOfDay } from "src/lib/time-of-day";
import { WeatherService } from "./weather.service";
import { GameClockService } from "./game-clock.service";

export interface AmbiancePayloadDto {
  campaignId: string;
  sceneId: string | null;
  weather: ReturnType<WeatherService["toDto"]>;
  timeOfDay: TimeOfDay;
  currentInGameDateTime: string;
  daysPassed: number;
  chaosFactor: number;
  visibleClocks: Array<{
    id: string;
    name: string;
    type: string;
    segments: number;
    filled: number;
    narrativeHint?: string;
  }>;
  locationType: string | null;
  locationId: string | null;
  locationName: string | null;
  locationSlug: string | null;
  narrativeSummary: string;
  travelInProgress?: {
    fromLocationId: string;
    toLocationId: string;
    toLocationName: string;
    destinationBiome: string;
    elapsedTurns: number;
    totalTurns: number;
    progressPercent: number;
  } | null;
}

const FALLBACK_WEATHER_DTO = (campaignId: string) => ({
  id: "00000000-0000-0000-0000-000000000000",
  campaignId,
  sceneId: null,
  precipitation: "clear" as const,
  visibility: "normal" as const,
  temperature: "mild" as const,
  windStrength: "calm" as const,
  magicalAnomaly: null,
  affectsChecks: {},
  narrativeSeed: undefined,
  rolledAt: new Date().toISOString(),
});

const PERIOD_PT: Record<TimeOfDay, string> = {
  dawn: "amanhecer",
  morning: "manhã",
  afternoon: "tarde",
  dusk: "anoitecer",
  night: "noite",
  midnight: "madrugada",
};

/**
 * Spec 019 — agrega weather + clock + chaos + clocks visíveis em
 * `AmbiancePayload` consumido pelo agent (`get_ambiance`) e frontend
 * (`useAmbiancePill`).
 */
@Injectable()
export class AmbianceService {
  constructor(
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(ClockEntity)
    private readonly clockRepo: Repository<ClockEntity>,
    @InjectRepository(SceneEntity)
    private readonly sceneRepo: Repository<SceneEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(WeatherEntity)
    private readonly weatherRepo: Repository<WeatherEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly weatherService: WeatherService,
    private readonly gameClockService: GameClockService,
  ) {}

  async assemble(
    campaignId: string,
    sceneId?: string | null,
    sessionId?: string | null,
  ): Promise<AmbiancePayloadDto> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} não encontrada.`);
    }

    let chaosFactor = 5;
    let travelInProgress: AmbiancePayloadDto["travelInProgress"] = null;
    if (sessionId) {
      const session = await this.sessionRepo.findOne({
        where: { id: sessionId },
        select: { id: true, chaosFactor: true, travelState: true },
      });
      if (session) {
        chaosFactor = session.chaosFactor;
        if (session.travelState?.active) {
          const t = session.travelState;
          travelInProgress = {
            fromLocationId: t.fromLocationId,
            toLocationId: t.toLocationId,
            toLocationName: t.toLocationName,
            destinationBiome: t.destinationBiome,
            elapsedTurns: t.elapsedTurns,
            totalTurns: t.totalTurns,
            progressPercent: Math.round((t.elapsedTurns / t.totalTurns) * 100),
          };
        }
      }
    }

    const clock = await this.gameClockService.getOrCreate(campaignId);
    const timeOfDay = computeTimeOfDay(
      clock.currentInGameDateTime,
      clock.sunriseTime,
      clock.sunsetTime,
    );

    const weather = await this.weatherService.getEffective(
      campaignId,
      sceneId ?? null,
    );
    const weatherDto = weather
      ? this.weatherService.toDto(weather)
      : FALLBACK_WEATHER_DTO(campaignId);

    const visibleClocks = await this.clockRepo.find({
      where: { campaignId, visibleToPlayer: true },
      order: { type: "ASC" },
    });

    let locationType: string | null = null;
    let locationId: string | null = null;
    let locationName: string | null = null;
    let locationSlug: string | null = null;
    let resolvedSceneId: string | null = sceneId ?? null;
    if (!resolvedSceneId && sessionId) {
      const active = await this.sceneRepo.findOne({
        where: { sessionId, isActive: true },
        select: ["id"],
      });
      resolvedSceneId = active?.id ?? null;
    }
    if (resolvedSceneId) {
      const scene = await this.sceneRepo.findOne({
        where: { id: resolvedSceneId },
        relations: ["location"],
      });
      if (scene?.location) {
        locationType = scene.location.type ?? null;
        locationId = scene.location.id;
        locationName = scene.location.name;
        locationSlug = scene.location.slug;
      }
    }

    const summaryParts: string[] = [];
    if (weatherDto.narrativeSeed) {
      summaryParts.push(weatherDto.narrativeSeed);
    }
    summaryParts.push(`É ${PERIOD_PT[timeOfDay]}.`);
    if (chaosFactor >= 8) {
      summaryParts.push("O ar pesa, algo está prestes a acontecer.");
    }
    const narrativeSummary = summaryParts.join(" ").slice(0, 240);

    return {
      campaignId,
      sceneId: resolvedSceneId,
      weather: weatherDto,
      timeOfDay,
      currentInGameDateTime: clock.currentInGameDateTime.toISOString(),
      daysPassed: clock.daysPassed,
      chaosFactor,
      visibleClocks: visibleClocks.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        segments: c.segments,
        filled: c.filled,
        narrativeHint: c.onFullAction?.narrativeSeed,
      })),
      locationType,
      locationId,
      locationName,
      locationSlug,
      narrativeSummary,
      travelInProgress,
    };
  }
}
