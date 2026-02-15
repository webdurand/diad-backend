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
}
