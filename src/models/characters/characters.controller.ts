import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';

interface CreateCharacterBody {
  name: string;
  data: Record<string, unknown>;
}

@Controller('characters')
@UseGuards(AuthGuard)
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

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

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: CreateCharacterBody) {
    const userId = req.user?.id ?? '';
    return this.charactersService.create({
      userId,
      name: body.name,
      data: body.data,
    });
  }
}
