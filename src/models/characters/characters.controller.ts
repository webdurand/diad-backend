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
import { CharactersService } from './characters.service';
import { CharacterSheetService } from './character-sheet.service';
import {
  CharacterStateService,
  type HpUpdateDto,
  type XpUpdateDto,
  type DeathSaveDto,
} from './character-state.service';
import { LevelUpService, type LevelUpDto } from './level-up.service';
import {
  SpellService,
  type PreparedSpellsDto,
  type SpellSlotUpdateDto,
  type RestDto,
} from './spell.service';
import {
  InventoryService,
  type AddItemDto,
  type UpdateItemDto,
  type GoldUpdateDto,
  type EquipToggleDto,
  type AttuneToggleDto,
  type AddMagicItemDto,
} from './inventory.service';
import { ActionsService } from './actions.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';

interface CreateCharacterBody {
  name: string;
  data: Record<string, unknown>;
}

interface UpdateCharacterBody {
  name?: string;
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
  ) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    const userId = req.user?.id ?? '';
    return this.charactersService.listByUser(userId);
  }

  @Get(':id')
  async getById(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.charactersService.getById(userId, id);
  }

  @Get(':id/sheet')
  async getSheet(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.sheetService.computeSheet(userId, id);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: CreateCharacterBody) {
    const userId = req.user?.id ?? '';
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
    const userId = req.user?.id ?? '';
    return this.charactersService.update(userId, id, body);
  }

  @Delete(':id')
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.charactersService.remove(userId, id);
  }

  @Patch(':id/hp')
  async updateHp(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: HpUpdateDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.stateService.updateHp(userId, id, body);
  }

  @Patch(':id/xp')
  async updateXp(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: XpUpdateDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.stateService.updateXp(userId, id, body);
  }

  @Patch(':id/death-saves')
  async updateDeathSaves(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: DeathSaveDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.stateService.updateDeathSaves(userId, id, body);
  }

  @Get(':id/actions')
  async getActions(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.actionsService.getActions(userId, id);
  }

  @Get(':id/level-up-options')
  async getLevelUpOptions(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.levelUpService.getOptions(userId, id);
  }

  @Post(':id/level-up')
  async levelUp(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: LevelUpDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.levelUpService.execute(userId, id, body);
  }

  @Get(':id/available-spells')
  async getAvailableSpells(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.spellService.getAvailableSpells(userId, id);
  }

  @Put(':id/prepared-spells')
  async updatePreparedSpells(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: PreparedSpellsDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.spellService.updatePreparedSpells(userId, id, body);
  }

  @Patch(':id/spell-slots')
  async updateSpellSlots(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: SpellSlotUpdateDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.spellService.updateSpellSlots(userId, id, body);
  }

  @Post(':id/rest')
  async rest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: RestDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.spellService.rest(userId, id, body);
  }

  // ---- Inventory ----

  @Get(':id/inventory')
  async getInventory(@Req() req: AuthRequest, @Param('id') id: string) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.getInventory(userId, id);
  }

  @Post(':id/inventory')
  async addItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: AddItemDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.addItem(userId, id, body);
  }

  @Patch(':id/inventory/:itemId')
  async updateItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateItemDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.updateItemQuantity(userId, id, itemId, body);
  }

  @Delete(':id/inventory/:itemId')
  async removeItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.removeItem(userId, id, itemId);
  }

  @Post(':id/inventory/:itemId/use')
  async useItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.useItem(userId, id, itemId);
  }

  @Patch(':id/gold')
  async updateGold(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: GoldUpdateDto,
  ) {
    const userId = req.user?.id ?? '';
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
    const userId = req.user?.id ?? '';
    return this.inventoryService.toggleEquip(userId, id, itemId, body);
  }

  // ---- Magic Items ----

  @Post(':id/magic-items')
  async addMagicItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: AddMagicItemDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.addMagicItem(userId, id, body);
  }

  @Delete(':id/magic-items/:itemId')
  async removeMagicItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.removeMagicItem(userId, id, itemId);
  }

  @Patch(':id/magic-items/:itemId/attune')
  async toggleAttune(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: AttuneToggleDto,
  ) {
    const userId = req.user?.id ?? '';
    return this.inventoryService.toggleAttune(userId, id, itemId, body);
  }
}
