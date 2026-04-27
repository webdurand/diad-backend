import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { UserEntity } from "src/entities";
import { AuthUserPayload } from "./auth.types";

interface RegisterInput {
  email: string;
  password: string;
  name: string;
  username: string;
  birthDate: string;
  phone: string;
}

interface LoginInput {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  private readonly cookieName = "diad_session";
  private readonly cookieMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<UserEntity> {
    const email = this.normalizeEmail(input.email);
    const username = this.normalizeUsername(input.username);
    const phone = this.normalizePhone(input.phone);
    const birthDate = this.normalizeBirthDate(input.birthDate);
    this.ensureValidCredentials(email, input.password);
    this.ensureValidProfile(input.name, username, birthDate, phone);

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new BadRequestException("Email ja cadastrado.");
    }

    const existingUsername = await this.userRepository.findOne({
      where: { username },
    });
    if (existingUsername) {
      throw new BadRequestException("Nome de usuario ja cadastrado.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = this.userRepository.create({
      email,
      passwordHash,
      name: input.name.trim(),
      username,
      birthDate,
      phone,
    });
    return this.userRepository.save(user);
  }

  async login(input: LoginInput): Promise<UserEntity> {
    const email = this.normalizeEmail(input.email);
    this.ensureValidCredentials(email, input.password);

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    return user;
  }

  signToken(user: UserEntity): string {
    const payload: AuthUserPayload = { id: user.id, email: user.email };
    return this.jwtService.sign(payload, {
      secret: this.getJwtSecret(),
      expiresIn: this.getJwtExpiresInSeconds(),
    });
  }

  verifyToken(token: string): AuthUserPayload {
    try {
      return this.jwtService.verify<AuthUserPayload>(token, {
        secret: this.getJwtSecret(),
      });
    } catch {
      throw new UnauthorizedException("Sessao expirada.");
    }
  }

  async getUserFromToken(token: string): Promise<UserEntity> {
    const payload = this.verifyToken(token);
    const user = await this.userRepository.findOne({
      where: { id: payload.id },
    });
    if (!user) {
      throw new UnauthorizedException("Usuario nao encontrado.");
    }
    return user;
  }

  getCookieName(): string {
    return this.cookieName;
  }

  getCookieOptions() {
    return {
      httpOnly: true,
      sameSite: "none" as const,
      secure: true,
      maxAge: this.cookieMaxAgeMs,
    };
  }

  private getJwtSecret(): string {
    return this.configService.get<string>("JWT_SECRET") ?? "dev-secret";
  }

  private getJwtExpiresInSeconds(): number {
    const raw = this.configService.get<string>("JWT_EXPIRES_IN_SECONDS");
    const parsed = raw ? Number(raw) : 0;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 7 * 24 * 60 * 60;
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, "");
  }

  private normalizeBirthDate(value: string): string {
    return value.trim();
  }

  private ensureValidCredentials(email: string, password: string) {
    if (!email || !email.includes("@")) {
      throw new BadRequestException("Email invalido.");
    }
    if (!password || password.length < 6) {
      throw new BadRequestException("Senha deve ter 6 caracteres ou mais.");
    }
  }

  private ensureValidProfile(
    name: string,
    username: string,
    birthDate: string,
    phone: string,
  ) {
    const usernamePattern = /^[a-z0-9._-]+$/;
    if (!name || name.trim().length < 2) {
      throw new BadRequestException("Nome invalido.");
    }
    if (!username || username.length < 3 || !usernamePattern.test(username)) {
      throw new BadRequestException("Nome de usuario invalido.");
    }
    const parsedDate = new Date(birthDate);
    const earliest = new Date("1900-01-01");
    const today = new Date();
    if (!birthDate || Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException("Data de nascimento invalida.");
    }
    if (parsedDate < earliest || parsedDate > today) {
      throw new BadRequestException("Data de nascimento invalida.");
    }
    if (phone.length < 10 || phone.length > 11) {
      throw new BadRequestException("Telefone invalido.");
    }
  }
}
