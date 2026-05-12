import { Controller, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";

@Controller("companions")
@UseGuards(AuthGuard)
export class CompanionsController {}
