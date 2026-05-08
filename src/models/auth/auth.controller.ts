import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import type { AuthRequest } from "./auth.types";

interface AuthBody {
  email: string;
  password: string;
  name?: string;
  username?: string;
  birthDate?: string;
  phone?: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() body: AuthBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.register({
      email: body.email,
      password: body.password,
      name: body.name ?? "",
      username: body.username ?? "",
      birthDate: body.birthDate ?? "",
      phone: body.phone ?? "",
    });
    const token = this.authService.signToken(user);
    res.cookie(
      this.authService.getCookieName(),
      token,
      this.authService.getCookieOptions(),
    );
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      accessToken: token,
    };
  }

  @Post("login")
  async login(
    @Body() body: AuthBody,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.login({
      email: body.email,
      password: body.password,
    });
    const token = this.authService.signToken(user);
    res.cookie(
      this.authService.getCookieName(),
      token,
      this.authService.getCookieOptions(),
    );
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      accessToken: token,
    };
  }

  @Post("logout")
  async logout(@Res({ passthrough: true }) res: Response) {
    res.cookie(this.authService.getCookieName(), "", {
      ...this.authService.getCookieOptions(),
      maxAge: 0,
    });
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get("me")
  async me(@Req() req: AuthRequest) {
    const user = req.user;
    return {
      id: user?.id,
      email: user?.email,
      name: user?.name,
      username: user?.username,
      role: user?.role,
    };
  }
}
