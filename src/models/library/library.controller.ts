import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
} from "@nestjs/common";
import { LibraryService } from "./library.service";
import {
  ENTITY_CONFIG,
  transformLibraryResponse,
} from "./library-response.config";
import { LibraryQueryDto } from "./dto/library-query.dto";
import {
  passesLocomotionFilter,
  resolveMaxCr,
  toBeastSummary,
} from "./beast-descriptors";

@Controller("library")
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get("beasts")
  async getBeasts(
    @Query("maxCrNumerator") maxCrNumeratorRaw?: string,
    @Query("maxCrDenominator") maxCrDenominatorRaw?: string,
    @Query("excludeFly") excludeFlyRaw?: string,
    @Query("excludeSwim") excludeSwimRaw?: string,
    @Query("excludeBurrow") excludeBurrowRaw?: string,
  ) {
    const numerator =
      maxCrNumeratorRaw != null ? parseInt(maxCrNumeratorRaw, 10) : NaN;
    const denominator =
      maxCrDenominatorRaw != null ? parseInt(maxCrDenominatorRaw, 10) : 1;
    if (!Number.isFinite(numerator) || numerator < 0) {
      throw new BadRequestException({
        ok: false,
        code: "INVALID_CR_FILTER",
        error: "maxCrNumerator é obrigatório (inteiro ≥ 0).",
      });
    }
    let maxCr: number;
    try {
      maxCr = resolveMaxCr(numerator, denominator);
    } catch (err) {
      const code = err instanceof Error ? err.message : "INVALID_CR_FILTER";
      throw new BadRequestException({
        ok: false,
        code,
        error:
          code === "INVALID_CR_DENOMINATOR"
            ? "Denominador RAW: apenas 1, 2, 4 ou 8."
            : "Filtro de CR inválido.",
      });
    }
    const excludeFly = excludeFlyRaw === "true" || excludeFlyRaw === "1";
    const excludeSwim = excludeSwimRaw === "true" || excludeSwimRaw === "1";
    const excludeBurrow =
      excludeBurrowRaw === "true" || excludeBurrowRaw === "1";

    const monsters = await this.libraryService.findBeastsForForm(maxCr);
    const summaries = monsters
      .filter((m) =>
        passesLocomotionFilter(m, { excludeFly, excludeSwim, excludeBurrow }),
      )
      .map(toBeastSummary)
      .filter((beast) => beast.hitPoints > 0 && beast.armorClass > 0);
    const uniqueByName = new Map<string, (typeof summaries)[number]>();
    for (const beast of summaries) {
      const key = beast.name.trim().toLocaleLowerCase();
      const existing = uniqueByName.get(key);
      if (
        !existing ||
        beast.hitPoints + beast.armorClass >
          existing.hitPoints + existing.armorClass
      ) {
        uniqueByName.set(key, beast);
      }
    }
    const filtered = [...uniqueByName.values()].sort(
      (a, b) => a.cr - b.cr || a.name.localeCompare(b.name),
    );

    return { beasts: filtered, total: filtered.length };
  }

  @Get("monster-summaries")
  @Header(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  )
  @Header(
    "Vercel-CDN-Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400",
  )
  @Header("Vercel-Cache-Tag", "monster-catalog")
  async getMonsterSummaries(@Query() query: LibraryQueryDto) {
    return this.libraryService.findMonsterSummaries(query);
  }

  @Get(":entity")
  async get(@Param("entity") entity: string, @Query() query: LibraryQueryDto) {
    const config = ENTITY_CONFIG[entity];
    const relations = config?.relations ? [...config.relations] : [];
    const isSourceEntity = entity === "comp_sources";
    if (
      !isSourceEntity &&
      !relations.some((r) => r === "source" || r.startsWith("source."))
    ) {
      relations.push("source");
    }

    const result = await this.libraryService.findPaginated(
      entity,
      entity,
      relations,
      query,
    );

    const transformed = transformLibraryResponse(
      result.data as unknown as Record<string, unknown>[],
      entity,
    );

    return {
      data: transformed,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }
}
