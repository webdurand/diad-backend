import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CharactersService } from './services/characters.service';
import { CharacterSheetService } from './services/character-sheet.service';
import {
  CharacterStateService,
  type HpUpdateDto,
  type XpUpdateDto,
  type DeathSaveDto,
  type KiPointsDto,
  type ConditionsDto,
  type ExhaustionDto,
  type InspirationDto,
} from './services/character-state.service';
import { LevelUpService, type LevelUpDto } from './services/level-up.service';
import {
  SpellService,
  type PreparedSpellsDto,
  type SpellSlotUpdateDto,
  type RestDto,
  type LearnSpellDto,
} from './services/spell.service';
import {
  InventoryService,
  type AddItemDto,
  type UpdateItemDto,
  type GoldUpdateDto,
  type EquipToggleDto,
  type AttuneToggleDto,
  type AddMagicItemDto,
} from './services/inventory.service';
import { ActionsService } from './services/actions.service';
import { CombatActionRegistry } from '../game-engine/services/combat-action-registry.service';
import type {
  ParticipantContext,
  ResolverSheetSlice,
} from '../game-engine/interfaces/combat-action.interfaces';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';
import { UnauthorizedException } from '@nestjs/common';

interface CreateCharacterBody {
  name: string;
  data: Record<string, unknown>;
}

interface UpdateCharacterBody {
  name?: string;
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException('Usuario nao autenticado.');
  return id;
}

@Controller('characters')
@UseGuards(AuthGuard)
export class CharactersController {
  constructor(
    private readonly charactersService: CharactersService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly levelUpService: LevelUpService,
    private readonly spellService: SpellService,
    private readonly inventoryService: InventoryService,
    private readonly actionsService: ActionsService,
    private readonly combatActionRegistry: CombatActionRegistry,
  ) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    const userId = getUserId(req);
    return this.charactersService.listByUser(userId);
    return this.charactersService.listByUser(userId);
  }

  @Get(':id')
  async getById(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.charactersService.getById(userId, id);
  }

  @Get(':id/sheet')
  async getSheet(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.sheetService.computeSheet(userId, id);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: CreateCharacterBody) {
    const userId = getUserId(req);
    return this.charactersService.create({
      userId,
      name: body.name,
      data: body.data,
    });
  }

  @Put(':id')
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateCharacterBody,
  ) {
    const userId = getUserId(req);
    return this.charactersService.update(userId, id, body);
  }

  @Delete(':id')
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.charactersService.remove(userId, id);
  }

  @Patch(':id/hp')
  async updateHp(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: HpUpdateDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateHp(userId, id, body);
  }

  @Patch(':id/xp')
  async updateXp(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: XpUpdateDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateXp(userId, id, body);
  }

  @Patch(':id/death-saves')
  async updateDeathSaves(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: DeathSaveDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateDeathSaves(userId, id, body);
  }

  @Get(':id/actions')
  async getActions(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.actionsService.getActions(userId, id);
  }

  /**
   * Spec 003 — lista tipada (`ActionDescriptor[]`) de ações disponíveis ao PC,
   * consultando o `CombatActionRegistry` (weapon + unarmed + generic + class-feature).
   * Out-of-encounter: ignora action economy (always available se o PC tem a ação),
   * mas respeita rest state (feature_uses_used, slots, equipment equipado).
   */
  @Get(':id/combat-actions')
  async getCombatActions(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    const sheet = await this.sheetService.computeSheet(userId, id);
    const sheetSlice: ResolverSheetSlice = {
      equipment: sheet.equipment.map((e) => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        equipped: e.equipped,
        damage: e.damage,
        range: e.range,
        properties: e.properties,
      })),
      classes: sheet.classes.map((c) => ({
        slug: c.slug,
        name: c.name,
        level: c.level,
      })),
      features: sheet.features.map((f) => ({
        slug: f.slug,
        name: f.name,
        level: f.level,
        active: f.active,
      })),
      abilityMods: sheet.abilityScores.reduce<Record<string, number>>(
        (acc, a) => {
          acc[a.slug] = a.modifier;
          return acc;
        },
        {},
      ),
      proficiencyBonus: sheet.proficiencyBonus,
      totalLevel: sheet.totalLevel,
    };

    const ctx: ParticipantContext = {
      type: 'pc',
      characterId: id,
      conditions: sheet.conditions,
      sheet: sheetSlice,
      // out-of-encounter: sem action economy → resolvers tratam available só por rest state
    };

    return this.combatActionRegistry.listActions(ctx);
  }

  @Get(':id/level-up-options')
  async getLevelUpOptions(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.levelUpService.getOptions(userId, id);
  }

  @Post(':id/level-up')
  async levelUp(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: LevelUpDto,
  ) {
    const userId = getUserId(req);
    return this.levelUpService.execute(userId, id, body);
  }

  @Get(':id/available-spells')
  async getAvailableSpells(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.spellService.getAvailableSpells(userId, id);
  }

  @Get(':id/manageable-spells')
  async getManageableSpells(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.spellService.getManageableSpells(userId, id);
  }

  @Post(':id/spells')
  async learnSpell(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: LearnSpellDto,
  ) {
    const userId = getUserId(req);
    return this.spellService.learnSpell(userId, id, body);
  }

  @Delete(':id/spells/:spellSlug')
  async unlearnSpell(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('spellSlug') spellSlug: string,
  ) {
    const userId = getUserId(req);
    return this.spellService.unlearnSpell(userId, id, spellSlug);
  }

  @Put(':id/prepared-spells')
  async updatePreparedSpells(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: PreparedSpellsDto,
  ) {
    const userId = getUserId(req);
    return this.spellService.updatePreparedSpells(userId, id, body);
  }

  @Patch(':id/spell-slots')
  async updateSpellSlots(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: SpellSlotUpdateDto,
  ) {
    const userId = getUserId(req);
    return this.spellService.updateSpellSlots(userId, id, body);
  }

  @Post(':id/rest')
  async rest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: RestDto,
  ) {
    const userId = getUserId(req);
    return this.spellService.rest(userId, id, body);
  }

  @Patch(':id/ki-points')
  async updateKiPoints(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: KiPointsDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateKiPoints(userId, id, body);
  }

  // ---- Conditions, Exhaustion, Inspiration ----

  @Patch(':id/conditions')
  async updateConditions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: ConditionsDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateConditions(userId, id, body);
  }

  @Patch(':id/exhaustion')
  async updateExhaustion(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: ExhaustionDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateExhaustion(userId, id, body);
  }

  @Patch(':id/inspiration')
  async updateInspiration(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: InspirationDto,
  ) {
    const userId = getUserId(req);
    return this.stateService.updateInspiration(userId, id, body);
  }

  // ---- Inventory ----

  @Get(':id/inventory')
  async getInventory(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = getUserId(req);
    return this.inventoryService.getInventory(userId, id);
  }

  @Post(':id/inventory')
  async addItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: AddItemDto,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.addItem(userId, id, body);
  }

  @Patch(':id/inventory/:itemId')
  async updateItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateItemDto,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.updateItemQuantity(userId, id, itemId, body);
  }

  @Delete(':id/inventory/:itemId')
  async removeItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.removeItem(userId, id, itemId);
  }

  @Post(':id/inventory/:itemId/use')
  async useItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.useItem(userId, id, itemId);
  }

  @Patch(':id/gold')
  async updateGold(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: GoldUpdateDto,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.updateGold(userId, id, body);
  }

  // ---- Equip / Attune ----

  @Patch(':id/equipment/:itemId/equip')
  async toggleEquip(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: EquipToggleDto,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.toggleEquip(userId, id, itemId, body);
  }

  // ---- Magic Items ----

  @Post(':id/magic-items')
  async addMagicItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: AddMagicItemDto,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.addMagicItem(userId, id, body);
  }

  @Delete(':id/magic-items/:itemId')
  async removeMagicItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.removeMagicItem(userId, id, itemId);
  }

  @Patch(':id/magic-items/:itemId/attune')
  async toggleAttune(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: AttuneToggleDto,
  ) {
    const userId = getUserId(req);
    return this.inventoryService.toggleAttune(userId, id, itemId, body);
  }
}
