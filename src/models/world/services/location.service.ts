import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationEntity } from 'src/entities/location.entity';
import { LocationConnectionEntity } from 'src/entities/location-connection.entity';
import { randomBytes } from 'crypto';

export interface CreateLocationDto {
  name: string;
  type: string;
  parentId?: string;
  description?: string;
  descriptionHidden?: string;
  atmosphere?: string;
  tags?: string[];
  properties?: Record<string, any>;
}

export interface UpdateLocationDto {
  name?: string;
  type?: string;
  parentId?: string;
  description?: string;
  descriptionHidden?: string;
  atmosphere?: string;
  tags?: string[];
  properties?: Record<string, any>;
  sortOrder?: number;
}

export interface AddConnectionDto {
  toLocationId: string;
  description?: string;
  travelTime?: string;
  isHidden?: boolean;
  isLocked?: boolean;
  requirements?: Record<string, any>;
}

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    @InjectRepository(LocationConnectionEntity)
    private readonly connectionRepo: Repository<LocationConnectionEntity>,
  ) {}

  async create(
    campaignId: string,
    dto: CreateLocationDto,
  ): Promise<LocationEntity> {
    const slug = this.generateSlug(dto.name);
    const location = this.locationRepo.create({
      campaignId,
      slug,
      name: dto.name,
      type: dto.type,
      parentId: dto.parentId,
      description: dto.description,
      descriptionHidden: dto.descriptionHidden,
      atmosphere: dto.atmosphere,
      tags: dto.tags ?? [],
      properties: dto.properties ?? {},
    });
    return this.locationRepo.save(location);
  }

  async getById(locationId: string): Promise<LocationEntity> {
    const loc = await this.locationRepo.findOne({
      where: { id: locationId },
      relations: ['children'],
    });
    if (!loc) throw new NotFoundException('Local nao encontrado.');
    return loc;
  }

  async getTree(campaignId: string): Promise<LocationEntity[]> {
    const all = await this.locationRepo.find({
      where: { campaignId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    // Build tree: root nodes have no parentId
    const map = new Map<string, LocationEntity & { children: LocationEntity[] }>();
    const roots: LocationEntity[] = [];

    for (const loc of all) {
      map.set(loc.id, { ...loc, children: [] });
    }

    for (const loc of all) {
      const node = map.get(loc.id)!;
      if (loc.parentId && map.has(loc.parentId)) {
        map.get(loc.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async update(
    locationId: string,
    dto: UpdateLocationDto,
  ): Promise<LocationEntity> {
    const loc = await this.getById(locationId);
    Object.assign(loc, dto);
    return this.locationRepo.save(loc);
  }

  async remove(locationId: string): Promise<void> {
    await this.locationRepo.delete(locationId);
  }

  /**
   * Spec 014 M2.A — idempotent visit marker.
   * Primeiro call grava visitedAt=now(); subsequentes preservam o timestamp original.
   * Retorna {firstVisit: boolean} pra caller decidir se emite evento narrativo.
   */
  async markVisited(
    locationId: string,
  ): Promise<{ location: LocationEntity; firstVisit: boolean }> {
    const loc = await this.getById(locationId);
    if (loc.visitedAt) {
      return { location: loc, firstVisit: false };
    }
    loc.visitedAt = new Date();
    const saved = await this.locationRepo.save(loc);
    return { location: saved, firstVisit: true };
  }

  async addConnection(
    fromLocationId: string,
    dto: AddConnectionDto,
  ): Promise<LocationConnectionEntity> {
    const conn = this.connectionRepo.create({
      fromLocationId,
      toLocationId: dto.toLocationId,
      description: dto.description,
      travelTime: dto.travelTime,
      isHidden: dto.isHidden ?? false,
      isLocked: dto.isLocked ?? false,
      requirements: dto.requirements ?? {},
    });
    return this.connectionRepo.save(conn);
  }

  async getConnections(
    locationId: string,
  ): Promise<LocationConnectionEntity[]> {
    return this.connectionRepo.find({
      where: [
        { fromLocationId: locationId },
        { toLocationId: locationId },
      ],
      relations: ['fromLocation', 'toLocation'],
    });
  }

  async listByCampaign(campaignId: string): Promise<LocationEntity[]> {
    return this.locationRepo.find({
      where: { campaignId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
  }
}
