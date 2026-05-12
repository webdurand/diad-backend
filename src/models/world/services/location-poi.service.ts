import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomBytes } from "crypto";
import { LocationEntity } from "src/entities/location.entity";
import { LocationPoiEntity } from "src/entities/location-poi.entity";

export interface CreateLocationPoiDto {
  name: string;
  type?: string;
  description?: string;
  atmosphere?: string;
  aliases?: string[];
  tags?: string[];
  isDefault?: boolean;
  isSecret?: boolean;
  isKnownToParty?: boolean;
  isLocked?: boolean;
  sortOrder?: number;
  properties?: Record<string, any>;
}

export interface UpdateLocationPoiDto {
  name?: string;
  type?: string;
  description?: string | null;
  atmosphere?: string | null;
  aliases?: string[];
  tags?: string[];
  isDefault?: boolean;
  isSecret?: boolean;
  isKnownToParty?: boolean;
  isLocked?: boolean;
  sortOrder?: number;
  properties?: Record<string, any>;
}

export type ResolvePoiResult =
  | { status: "found"; poi: LocationPoiEntity }
  | { status: "hidden"; poi: LocationPoiEntity }
  | { status: "ambiguous"; matches: LocationPoiEntity[] }
  | { status: "not_found"; suggestions: LocationPoiEntity[] };

function normalizePoiText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

@Injectable()
export class LocationPoiService {
  constructor(
    @InjectRepository(LocationPoiEntity)
    private readonly poiRepo: Repository<LocationPoiEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  async create(
    campaignId: string,
    locationId: string,
    dto: CreateLocationPoiDto,
  ): Promise<LocationPoiEntity> {
    const location = await this.locationRepo.findOne({
      where: { id: locationId, campaignId },
    });
    if (!location) throw new NotFoundException("Location nao encontrada.");

    if (dto.isDefault) {
      await this.poiRepo.update(
        { locationId, isDefault: true },
        { isDefault: false },
      );
    }

    const isSecret = dto.isSecret ?? false;
    const poi = this.poiRepo.create({
      campaignId,
      locationId,
      name: dto.name,
      slug: await this.generateUniqueSlug(locationId, dto.name),
      type: dto.type ?? "area",
      description: dto.description,
      atmosphere: dto.atmosphere,
      aliases: dto.aliases ?? [],
      tags: dto.tags ?? [],
      isDefault: dto.isDefault ?? false,
      isSecret,
      isKnownToParty: dto.isKnownToParty ?? !isSecret,
      isLocked: dto.isLocked ?? false,
      sortOrder: dto.sortOrder ?? 0,
      properties: dto.properties ?? {},
    });
    return this.poiRepo.save(poi);
  }

  async update(
    campaignId: string,
    poiId: string,
    dto: UpdateLocationPoiDto,
  ): Promise<LocationPoiEntity> {
    const poi = await this.poiRepo.findOne({ where: { id: poiId, campaignId } });
    if (!poi) throw new NotFoundException("POI nao encontrado.");

    if (dto.isDefault === true) {
      await this.poiRepo.update(
        { locationId: poi.locationId, isDefault: true },
        { isDefault: false },
      );
      poi.isDefault = true;
      poi.isSecret = false;
      poi.isKnownToParty = true;
    } else if (dto.isDefault !== undefined) {
      poi.isDefault = dto.isDefault;
    }

    if (dto.name !== undefined && dto.name !== poi.name) {
      poi.name = dto.name;
      poi.slug = await this.generateUniqueSlug(poi.locationId, dto.name, poi.id);
    }
    if (dto.type !== undefined) poi.type = dto.type;
    if (dto.description !== undefined) poi.description = dto.description ?? undefined;
    if (dto.atmosphere !== undefined) poi.atmosphere = dto.atmosphere ?? undefined;
    if (dto.aliases !== undefined) poi.aliases = dto.aliases;
    if (dto.tags !== undefined) poi.tags = dto.tags;
    if (dto.isSecret !== undefined) poi.isSecret = dto.isSecret;
    if (dto.isKnownToParty !== undefined) {
      poi.isKnownToParty = dto.isKnownToParty;
    }
    if (dto.isLocked !== undefined) poi.isLocked = dto.isLocked;
    if (dto.sortOrder !== undefined) poi.sortOrder = dto.sortOrder;
    if (dto.properties !== undefined) poi.properties = dto.properties;

    if (poi.isDefault) {
      poi.isSecret = false;
      poi.isKnownToParty = true;
      poi.isLocked = false;
    }
    return this.poiRepo.save(poi);
  }

  async listByLocation(
    campaignId: string,
    locationId: string,
    options: { includeHidden?: boolean } = {},
  ): Promise<LocationPoiEntity[]> {
    const pois = await this.poiRepo.find({
      where: { campaignId, locationId },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    if (options.includeHidden) return pois;
    return pois.filter((poi) => poi.isKnownToParty && !poi.isLocked);
  }

  async listKnownByLocation(locationId: string): Promise<LocationPoiEntity[]> {
    return this.poiRepo.find({
      where: { locationId, isKnownToParty: true },
      order: { sortOrder: "ASC", name: "ASC" },
    });
  }

  async getById(poiId: string): Promise<LocationPoiEntity> {
    const poi = await this.poiRepo.findOne({
      where: { id: poiId },
      relations: ["location"],
    });
    if (!poi) throw new NotFoundException("POI nao encontrado.");
    return poi;
  }

  async getDefaultForLocation(
    campaignId: string,
    locationId: string,
  ): Promise<LocationPoiEntity> {
    const existingDefault = await this.poiRepo.findOne({
      where: { campaignId, locationId, isDefault: true },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    if (existingDefault) return existingDefault;

    const firstKnown = await this.poiRepo.findOne({
      where: { campaignId, locationId, isKnownToParty: true },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    if (firstKnown) {
      firstKnown.isDefault = true;
      firstKnown.isSecret = false;
      firstKnown.isKnownToParty = true;
      return this.poiRepo.save(firstKnown);
    }

    return this.create(campaignId, locationId, {
      name: "Area principal",
      type: "area",
      isDefault: true,
      isKnownToParty: true,
      sortOrder: -1000,
    });
  }

  async ensureDefaultForLocation(
    campaignId: string,
    locationId: string,
  ): Promise<LocationPoiEntity> {
    return this.getDefaultForLocation(campaignId, locationId);
  }

  async resolveInLocation(
    locationId: string,
    input: { targetPoiId?: string; targetPoiName?: string },
  ): Promise<ResolvePoiResult> {
    const allPois = await this.poiRepo.find({
      where: { locationId },
      order: { sortOrder: "ASC", name: "ASC" },
    });
    if (input.targetPoiId) {
      const poi = allPois.find((candidate) => candidate.id === input.targetPoiId);
      if (!poi) return { status: "not_found", suggestions: this.suggestPois("", allPois) };
      if (!poi.isKnownToParty) return { status: "hidden", poi };
      return { status: "found", poi };
    }

    const rawName = input.targetPoiName?.trim();
    if (!rawName) return { status: "not_found", suggestions: this.suggestPois("", allPois) };
    const needle = normalizePoiText(rawName);
    if (!needle) return { status: "not_found", suggestions: this.suggestPois("", allPois) };

    const scored = allPois
      .map((poi) => ({ poi, score: this.scorePoiMatch(poi, needle) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 45) {
      return { status: "not_found", suggestions: this.suggestPois(rawName, allPois) };
    }
    const tied = scored.filter((match) => match.score === best.score);
    if (tied.length > 1 && best.score >= 80) {
      return { status: "ambiguous", matches: tied.map((match) => match.poi) };
    }
    if (!best.poi.isKnownToParty) {
      return { status: "hidden", poi: best.poi };
    }
    return { status: "found", poi: best.poi };
  }

  async revealExisting(
    campaignId: string,
    input: { poiId?: string; locationId?: string; poiName?: string },
  ): Promise<LocationPoiEntity | null> {
    let poi: LocationPoiEntity | null = null;
    if (input.poiId) {
      poi = await this.poiRepo.findOne({
        where: { id: input.poiId, campaignId },
      });
    } else if (input.locationId && input.poiName) {
      const resolved = await this.resolveInLocation(input.locationId, {
        targetPoiName: input.poiName,
      });
      if (resolved.status === "hidden" || resolved.status === "found") {
        poi = resolved.poi;
      }
    }
    if (!poi) return null;
    poi.isKnownToParty = true;
    return this.poiRepo.save(poi);
  }

  toDto(poi: LocationPoiEntity) {
    return {
      id: poi.id,
      campaignId: poi.campaignId,
      locationId: poi.locationId,
      name: poi.name,
      slug: poi.slug,
      type: poi.type,
      description: poi.description ?? null,
      atmosphere: poi.atmosphere ?? null,
      aliases: poi.aliases ?? [],
      tags: poi.tags ?? [],
      isDefault: poi.isDefault,
      isSecret: poi.isSecret,
      isKnownToParty: poi.isKnownToParty,
      isLocked: poi.isLocked,
      sortOrder: poi.sortOrder,
      properties: poi.properties ?? {},
    };
  }

  private async generateUniqueSlug(
    locationId: string,
    name: string,
    ignoredPoiId?: string,
  ): Promise<string> {
    const base =
      normalizePoiText(name).replace(/ /g, "-") ||
      `poi-${randomBytes(3).toString("hex")}`;
    let candidate = base;
    let suffix = 1;
    while (true) {
      const existing = await this.poiRepo.findOne({
        where: { locationId, slug: candidate },
      });
      if (!existing || existing.id === ignoredPoiId) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  private scorePoiMatch(poi: LocationPoiEntity, needle: string): number {
    const terms = this.poiSearchTerms(poi)
      .map(normalizePoiText)
      .filter(Boolean);
    if (terms.some((term) => term === needle)) return 100;
    if (terms.some((term) => term.includes(needle))) return 85;
    if (terms.some((term) => needle.includes(term) && term.length >= 4)) {
      return 75;
    }
    const description = normalizePoiText(poi.description ?? "");
    if (description.includes(needle) && needle.length >= 5) return 50;
    const tokens = needle.split(" ").filter((token) => token.length >= 4);
    if (
      tokens.length > 0 &&
      tokens.every(
        (token) =>
          terms.some((term) => term.includes(token)) ||
          description.includes(token),
      )
    ) {
      return 45;
    }
    return 0;
  }

  private suggestPois(
    rawName: string,
    pois: LocationPoiEntity[],
  ): LocationPoiEntity[] {
    const known = pois.filter((poi) => poi.isKnownToParty);
    const needle = normalizePoiText(rawName);
    if (!needle) return known.slice(0, 4);
    return known
      .map((poi) => ({ poi, score: this.scorePoiMatch(poi, needle) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((match) => match.poi);
  }

  private poiSearchTerms(poi: LocationPoiEntity): string[] {
    const props = (poi.properties ?? {}) as Record<string, unknown>;
    const aliases = [
      props.aliases,
      props.alias,
      props.knownAs,
      poi.aliases,
    ]
      .flat()
      .filter((value): value is string => typeof value === "string");
    return [
      poi.name,
      poi.slug,
      poi.type,
      ...(poi.tags ?? []),
      ...aliases,
    ].filter((value): value is string => value.trim().length > 0);
  }
}
