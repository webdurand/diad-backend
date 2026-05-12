import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CompanionTemplateEntity,
  CompanionIntroductionHook,
  PersonalityBig5,
} from "src/entities/companion-template.entity";
import { AiProxyService } from "../../ai-proxy/ai-proxy.service";

export interface CreateCompanionTemplateDto {
  name: string;
  slug?: string;
  race: string;
  portraitUrl?: string | null;
  personalityBig5: PersonalityBig5;
  dialogueStyle: string;
  voiceNotes: string;
  motivation: string;
  companionProfile?: Record<string, unknown> | null;
  suggestedBuild?: Record<string, unknown> | null;
  introductionHook?: CompanionIntroductionHook | null;
  displayOrder?: number;
}

export type UpdateCompanionTemplateDto = Partial<CreateCompanionTemplateDto>;

export interface ForgeCompanionTemplateDto {
  name: string;
  race: string;
  portraitUrl?: string | null;
  personaSummary: string;
  suggestedClassHint?: string | null;
  introductionHook?: CompanionIntroductionHook | null;
  displayOrder?: number;
}

interface ForgeCompanionTemplateResult {
  personalityBig5?: unknown;
  dialogueStyle?: unknown;
  voiceNotes?: unknown;
  motivation?: unknown;
  companionProfile?: unknown;
  suggestedBuild?: unknown;
}

const DEFAULT_BIG5: PersonalityBig5 = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

@Injectable()
export class CompanionTemplateService {
  constructor(
    @InjectRepository(CompanionTemplateEntity)
    private readonly companionTemplateRepo: Repository<CompanionTemplateEntity>,
    private readonly aiProxyService: AiProxyService,
  ) {}

  async list(campaignId: string): Promise<CompanionTemplateEntity[]> {
    return this.companionTemplateRepo.find({
      where: { campaignId },
      order: { displayOrder: "ASC", name: "ASC" },
    });
  }

  async create(
    campaignId: string,
    dto: CreateCompanionTemplateDto,
  ): Promise<CompanionTemplateEntity> {
    const template = this.companionTemplateRepo.create({
      ...dto,
      campaignId,
      slug: dto.slug ?? this.slugify(dto.name),
      portraitUrl: dto.portraitUrl ?? null,
      companionProfile: dto.companionProfile ?? null,
      suggestedBuild: dto.suggestedBuild ?? null,
      introductionHook: dto.introductionHook ?? null,
      displayOrder: dto.displayOrder ?? 0,
    });
    return this.companionTemplateRepo.save(template);
  }

  async forge(
    campaignId: string,
    dto: ForgeCompanionTemplateDto,
    userId?: string,
  ): Promise<CompanionTemplateEntity> {
    const result =
      await this.aiProxyService.postJsonToAgent<ForgeCompanionTemplateResult>(
        "/companion-forge",
        {
          campaignId,
          name: dto.name,
          race: dto.race,
          portraitUrl: dto.portraitUrl ?? null,
          personaSummary: dto.personaSummary,
          suggestedClassHint: dto.suggestedClassHint ?? null,
          introductionHook: dto.introductionHook ?? null,
        },
        { timeoutMs: 45000, userId },
      );

    return this.create(campaignId, {
      name: dto.name,
      race: dto.race,
      portraitUrl: dto.portraitUrl ?? null,
      personalityBig5: this.normalizeBig5(result.personalityBig5),
      dialogueStyle: this.readString(
        result.dialogueStyle,
        "Fala de forma direta, com uma marca pessoal reconhecivel.",
      ),
      voiceNotes: this.readString(
        result.voiceNotes,
        "Manter a ferida central e frases assinatura em cada fala relevante.",
      ),
      motivation: this.readString(result.motivation, dto.personaSummary),
      companionProfile: this.readRecord(result.companionProfile),
      suggestedBuild: this.readRecord(result.suggestedBuild),
      introductionHook: dto.introductionHook ?? null,
      displayOrder: dto.displayOrder ?? 0,
    });
  }

  async update(
    campaignId: string,
    templateId: string,
    dto: UpdateCompanionTemplateDto,
  ): Promise<CompanionTemplateEntity> {
    const template = await this.getById(campaignId, templateId);
    Object.assign(template, {
      ...dto,
      slug: dto.slug ?? (dto.name ? this.slugify(dto.name) : template.slug),
    });
    return this.companionTemplateRepo.save(template);
  }

  async remove(campaignId: string, templateId: string): Promise<void> {
    await this.getById(campaignId, templateId);
    await this.companionTemplateRepo.delete({ id: templateId, campaignId });
  }

  async getById(
    campaignId: string,
    templateId: string,
  ): Promise<CompanionTemplateEntity> {
    const template = await this.companionTemplateRepo.findOne({
      where: { id: templateId, campaignId },
    });
    if (!template) throw new NotFoundException("Companion template not found.");
    return template;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private normalizeBig5(value: unknown): PersonalityBig5 {
    if (!this.isRecord(value)) return DEFAULT_BIG5;
    return {
      openness: this.clamp01(value.openness),
      conscientiousness: this.clamp01(value.conscientiousness),
      extraversion: this.clamp01(value.extraversion),
      agreeableness: this.clamp01(value.agreeableness),
      neuroticism: this.clamp01(value.neuroticism),
    };
  }

  private clamp01(value: unknown): number {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return 0.5;
    return Math.max(0, Math.min(1, number));
  }

  private readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
