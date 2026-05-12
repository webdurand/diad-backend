import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  WeatherAffectsChecks,
  WeatherEntity,
  WeatherPrecipitation,
  WeatherTemperature,
  WeatherVisibility,
  WeatherWindStrength,
} from "src/entities/weather.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export type Biome = "forest" | "plains" | "mountain" | "swamp" | "desert";

/**
 * Probabilidades por biome em pontos percentuais (somam 100).
 * Calibrado per spec 019 §7.4 — ajustar pós-playtest.
 */
const WEATHER_PROBABILITIES: Record<
  Biome,
  Record<WeatherPrecipitation, number>
> = {
  forest: { clear: 40, rain: 30, storm: 10, snow: 5, fog: 13, magical: 2 },
  plains: { clear: 50, rain: 25, storm: 15, snow: 5, fog: 4, magical: 1 },
  mountain: { clear: 25, rain: 15, storm: 15, snow: 35, fog: 8, magical: 2 },
  swamp: { clear: 20, rain: 30, storm: 10, snow: 0, fog: 35, magical: 5 },
  desert: { clear: 70, rain: 2, storm: 5, snow: 0, fog: 3, magical: 20 },
};

/**
 * Modifiers RAW DMG pp 109-112 + house derivations da spec 019 §4.5.
 * Lookup table determinística — CombatAgent L1 lê direto sem mock.
 */
function deriveAffectsChecks(
  precip: WeatherPrecipitation,
  visibility: WeatherVisibility,
  wind: WeatherWindStrength,
): WeatherAffectsChecks {
  const out: WeatherAffectsChecks = {};
  if (precip === "storm") {
    out.perception = -2;
    out.ranged = "disadvantage";
  }
  if (precip === "snow") {
    out.speedMultiplier = 0.5;
  }
  if (precip === "rain") {
    out.stealth = 1; // ruído ambiente ajuda stealth (sutil)
  }
  if (visibility === "obscured" || visibility === "dark") {
    out.perception = (out.perception ?? 0) - 5;
  } else if (visibility === "dim") {
    out.perception = (out.perception ?? 0) - 2;
  }
  if (wind === "gale") {
    out.ranged = "disadvantage";
  }
  return out;
}

function pickByProbabilities(
  table: Record<WeatherPrecipitation, number>,
): WeatherPrecipitation {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, p] of Object.entries(table) as Array<
    [WeatherPrecipitation, number]
  >) {
    r -= p;
    if (r <= 0) return k;
  }
  return "clear";
}

function deriveVisibility(precip: WeatherPrecipitation): WeatherVisibility {
  if (precip === "fog") return "obscured";
  if (precip === "storm") return "dim";
  if (precip === "snow") return "dim";
  if (precip === "rain") return "dim";
  if (precip === "magical") return "dim";
  return "normal";
}

function deriveTemperature(biome: Biome): WeatherTemperature {
  if (biome === "mountain") return "cold";
  if (biome === "desert") return "hot";
  if (biome === "swamp") return "hot";
  return "mild";
}

function deriveWind(precip: WeatherPrecipitation): WeatherWindStrength {
  if (precip === "storm") return "gale";
  if (precip === "rain") return "breeze";
  return "calm";
}

const NARRATIVE_SEEDS: Record<WeatherPrecipitation, string[]> = {
  clear: ["Céu limpo, ar quieto.", "O sol cobre o cenário."],
  rain: ["Chuva fina cai sem pressa.", "Gotas batem em telhas e folhas."],
  storm: [
    "Trovões rasgam o horizonte.",
    "Vento forte arranca galhos; chuva fustiga o rosto.",
  ],
  snow: [
    "Neve cobre tudo num silêncio frio.",
    "Flocos descem em ritmo lento, abafando passos.",
  ],
  fog: [
    "Névoa densa engole formas a poucos passos.",
    "O ar parece prender o som.",
  ],
  magical: [
    "Algo no ar não bate certo — cores tremem nas bordas.",
    "Cheiro de ozônio e poeira de estrela.",
  ],
};

function pickSeed(precip: WeatherPrecipitation): string {
  const opts = NARRATIVE_SEEDS[precip];
  return opts[Math.floor(Math.random() * opts.length)];
}

/**
 * Spec 019 — WeatherService.
 *
 * Roll de clima por (campaign, biome) usando tabela seedada (§7.4) →
 * persiste row em `weather` e emite `WorldEvent.weather_changed`.
 *
 * Idempotency: `roll` overrides row default-da-campanha (sceneId NULL) OU
 * cria override por scene (sceneId fornecido).
 */
@Injectable()
export class WeatherService {
  constructor(
    @InjectRepository(WeatherEntity)
    private readonly weatherRepo: Repository<WeatherEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  /**
   * Recupera weather efetivo: scene override se existir, senão default
   * da campanha, senão null.
   */
  async getEffective(
    campaignId: string,
    sceneId?: string | null,
  ): Promise<WeatherEntity | null> {
    if (sceneId) {
      const override = await this.weatherRepo.findOne({
        where: { campaignId, sceneId },
      });
      if (override) return override;
    }
    return this.weatherRepo.findOne({
      where: { campaignId, sceneId: IsNull() },
    });
  }

  async rollWeather(
    campaignId: string,
    biome: Biome,
    options: { sceneId?: string | null; traceId?: string } = {},
  ): Promise<WeatherEntity> {
    const { sceneId = null, traceId } = options;

    if (!(biome in WEATHER_PROBABILITIES)) {
      throw new DomainException(
        ErrorCode.WEATHER_INVALID_BIOME,
        `Biome '${biome}' não suportado.`,
        {
          context: { biome },
          hint: `Biomes válidos: ${Object.keys(WEATHER_PROBABILITIES).join(", ")}.`,
        },
      );
    }

    const previous = await this.getEffective(campaignId, sceneId);
    const previousPrecipitation = previous?.precipitation ?? null;

    const precipitation = pickByProbabilities(WEATHER_PROBABILITIES[biome]);
    const visibility = deriveVisibility(precipitation);
    const temperature = deriveTemperature(biome);
    const windStrength = deriveWind(precipitation);
    const magicalAnomaly =
      precipitation === "magical" ? "weave_unstable" : null;
    const affectsChecks = deriveAffectsChecks(
      precipitation,
      visibility,
      windStrength,
    );

    // Upsert por (campaign_id, scene_id).
    let row = await this.weatherRepo.findOne({
      where: { campaignId, sceneId: sceneId ?? IsNull() },
    });
    if (!row) {
      row = this.weatherRepo.create({
        campaignId,
        sceneId: sceneId ?? null,
      });
    }
    row.precipitation = precipitation;
    row.visibility = visibility;
    row.temperature = temperature;
    row.windStrength = windStrength;
    row.magicalAnomaly = magicalAnomaly;
    row.affectsChecks = affectsChecks;
    row.narrativeSeed = pickSeed(precipitation);
    row.rolledAt = new Date();
    const saved = await this.weatherRepo.save(row);

    const envelope = this.factory.build({
      eventCategory: "WorldEvent",
      eventType: "weather_changed",
      source: {
        service: "diad-backend",
        module: "WeatherService.rollWeather",
        traceId,
      },
      scope: { campaignId, sceneId: sceneId ?? undefined },
      payload: {
        campaignId,
        sceneId: sceneId ?? null,
        weather: this.toDto(saved),
        previousPrecipitation,
        trigger: "manual",
      },
      narrativeDescriptor: saved.narrativeSeed?.slice(0, 120),
    });
    try {
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort */
    }

    return saved;
  }

  toDto(row: WeatherEntity): {
    id: string;
    campaignId: string;
    sceneId: string | null;
    precipitation: WeatherPrecipitation;
    visibility: WeatherVisibility;
    temperature: WeatherTemperature;
    windStrength: WeatherWindStrength;
    magicalAnomaly: string | null;
    affectsChecks: WeatherAffectsChecks;
    narrativeSeed?: string;
    rolledAt: string;
  } {
    return {
      id: row.id,
      campaignId: row.campaignId,
      sceneId: row.sceneId ?? null,
      precipitation: row.precipitation,
      visibility: row.visibility,
      temperature: row.temperature,
      windStrength: row.windStrength,
      magicalAnomaly: row.magicalAnomaly ?? null,
      affectsChecks: row.affectsChecks ?? {},
      narrativeSeed: row.narrativeSeed,
      rolledAt: row.rolledAt.toISOString(),
    };
  }
}
