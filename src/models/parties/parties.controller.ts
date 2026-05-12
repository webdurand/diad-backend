import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthRequest } from "../auth/auth.types";
import {
  PartiesService,
  type InviteCompanionDto,
} from "./services/parties.service";

function getUserId(req: AuthRequest): string {
  const id = req.user?.id;
  if (!id) throw new UnauthorizedException("Usuario nao autenticado.");
  return id;
}

@Controller("campaigns/:id/party")
@UseGuards(AuthGuard)
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Get()
  async list(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Query("ownerCharacterId") ownerCharacterId?: string,
  ) {
    return this.partiesService.list(campaignId, getUserId(req), ownerCharacterId);
  }

  @Post("invite")
  async invite(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Body() dto: InviteCompanionDto,
  ) {
    return this.partiesService.invite(campaignId, getUserId(req), dto);
  }

  @Post(":companionCharacterId/activate")
  async activate(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Param("companionCharacterId") companionCharacterId: string,
  ) {
    return this.partiesService.activate(
      campaignId,
      getUserId(req),
      companionCharacterId,
    );
  }

  @Post(":companionCharacterId/deactivate")
  async deactivate(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Param("companionCharacterId") companionCharacterId: string,
  ) {
    return this.partiesService.deactivate(
      campaignId,
      getUserId(req),
      companionCharacterId,
    );
  }

  @Post(":companionCharacterId/dismiss")
  async dismiss(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Param("companionCharacterId") companionCharacterId: string,
  ) {
    return this.partiesService.dismiss(
      campaignId,
      getUserId(req),
      companionCharacterId,
    );
  }

  @Get(":companionCharacterId/summary")
  async summary(
    @Req() req: AuthRequest,
    @Param("id") campaignId: string,
    @Param("companionCharacterId") companionCharacterId: string,
  ) {
    return this.partiesService.summary(
      campaignId,
      getUserId(req),
      companionCharacterId,
    );
  }
}
