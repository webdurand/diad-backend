import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "src/models/auth/auth.guard";
import { QuickPlayService } from "./quick-play.service";
import type { CreateQuickPlayEncounterDto } from "./quick-play.service";

interface AuthRequest extends Request {
  user?: { id: string };
}

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}

@Controller("quick-play")
@UseGuards(AuthGuard)
export class QuickPlayController {
  constructor(private readonly quickPlayService: QuickPlayService) {}

  @Post("encounters")
  @HttpCode(HttpStatus.CREATED)
  async createEncounter(
    @Req() req: AuthRequest,
    @Body() dto: CreateQuickPlayEncounterDto,
  ) {
    const userId = getUserId(req);
    return this.quickPlayService.createEncounter(userId, dto);
  }
}
