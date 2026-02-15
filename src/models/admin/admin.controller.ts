import { Controller, Post, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { AdminService, SeedResult } from './admin.service';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  // ────── Fase 0 ──────

  @Post('comp-sources')
  @HttpCode(HttpStatus.OK)
  async seedCompSources(): Promise<SeedResult> {
    this.logger.log('▶ Seed comp_sources');
    return this.adminService.seedCompSources();
  }

  // ────── Fase 1 — Sem dependências ──────

  @Post('ability-scores')
  @HttpCode(HttpStatus.OK)
  async seedAbilityScores(): Promise<SeedResult> {
    this.logger.log('▶ Seed ability_scores');
    return this.adminService.seedAbilityScores();
  }

  @Post('alignments')
  @HttpCode(HttpStatus.OK)
  async seedAlignments(): Promise<SeedResult> {
    this.logger.log('▶ Seed alignments');
    return this.adminService.seedAlignments();
  }

  @Post('conditions')
  @HttpCode(HttpStatus.OK)
  async seedConditions(): Promise<SeedResult> {
    this.logger.log('▶ Seed conditions');
    return this.adminService.seedConditions();
  }

  @Post('damage-types')
  @HttpCode(HttpStatus.OK)
  async seedDamageTypes(): Promise<SeedResult> {
    this.logger.log('▶ Seed damage_types');
    return this.adminService.seedDamageTypes();
  }

  @Post('languages')
  @HttpCode(HttpStatus.OK)
  async seedLanguages(): Promise<SeedResult> {
    this.logger.log('▶ Seed languages');
    return this.adminService.seedLanguages();
  }

  @Post('magic-schools')
  @HttpCode(HttpStatus.OK)
  async seedMagicSchools(): Promise<SeedResult> {
    this.logger.log('▶ Seed magic_schools');
    return this.adminService.seedMagicSchools();
  }

  @Post('weapon-properties')
  @HttpCode(HttpStatus.OK)
  async seedWeaponProperties(): Promise<SeedResult> {
    this.logger.log('▶ Seed weapon_properties');
    return this.adminService.seedWeaponProperties();
  }

  @Post('weapon-mastery-properties')
  @HttpCode(HttpStatus.OK)
  async seedWeaponMasteryProperties(): Promise<SeedResult> {
    this.logger.log('▶ Seed weapon_mastery_properties');
    return this.adminService.seedWeaponMasteryProperties();
  }

  @Post('rule-sections')
  @HttpCode(HttpStatus.OK)
  async seedRuleSections(): Promise<SeedResult> {
    this.logger.log('▶ Seed rule_sections');
    return this.adminService.seedRuleSections();
  }

  @Post('equipment-categories')
  @HttpCode(HttpStatus.OK)
  async seedEquipmentCategories(): Promise<SeedResult> {
    this.logger.log('▶ Seed equipment_categories');
    return this.adminService.seedEquipmentCategories();
  }

  @Post('proficiencies')
  @HttpCode(HttpStatus.OK)
  async seedProficiencies(): Promise<SeedResult> {
    this.logger.log('▶ Seed proficiencies');
    return this.adminService.seedProficiencies();
  }

  // ────── Fase 2 — Dependem da Fase 1 ──────

  @Post('skills')
  @HttpCode(HttpStatus.OK)
  async seedSkills(): Promise<SeedResult> {
    this.logger.log('▶ Seed skills');
    return this.adminService.seedSkills();
  }

  @Post('equipment')
  @HttpCode(HttpStatus.OK)
  async seedEquipment(): Promise<SeedResult> {
    this.logger.log('▶ Seed equipment');
    return this.adminService.seedEquipment();
  }

  @Post('feats')
  @HttpCode(HttpStatus.OK)
  async seedFeats(): Promise<SeedResult> {
    this.logger.log('▶ Seed feats');
    return this.adminService.seedFeats();
  }

  @Post('rules')
  @HttpCode(HttpStatus.OK)
  async seedRules(): Promise<SeedResult> {
    this.logger.log('▶ Seed rules');
    return this.adminService.seedRules();
  }

  // ────── Fase 3 — Classes e Races ──────

  @Post('classes')
  @HttpCode(HttpStatus.OK)
  async seedClasses(): Promise<SeedResult> {
    this.logger.log('▶ Seed classes');
    return this.adminService.seedClasses();
  }

  @Post('races')
  @HttpCode(HttpStatus.OK)
  async seedRaces(): Promise<SeedResult> {
    this.logger.log('▶ Seed races');
    return this.adminService.seedRaces();
  }

  // ────── Fase 4 — Subclasses, Subraces, Traits, Backgrounds ──────

  @Post('subclasses')
  @HttpCode(HttpStatus.OK)
  async seedSubclasses(): Promise<SeedResult> {
    this.logger.log('▶ Seed subclasses');
    return this.adminService.seedSubclasses();
  }

  @Post('subraces')
  @HttpCode(HttpStatus.OK)
  async seedSubraces(): Promise<SeedResult> {
    this.logger.log('▶ Seed subraces');
    return this.adminService.seedSubraces();
  }

  @Post('traits')
  @HttpCode(HttpStatus.OK)
  async seedTraits(): Promise<SeedResult> {
    this.logger.log('▶ Seed traits');
    return this.adminService.seedTraits();
  }

  @Post('backgrounds')
  @HttpCode(HttpStatus.OK)
  async seedBackgrounds(): Promise<SeedResult> {
    this.logger.log('▶ Seed backgrounds');
    return this.adminService.seedBackgrounds();
  }

  @Post('eldritch-invocations')
  @HttpCode(HttpStatus.OK)
  async seedEldritchInvocations(): Promise<SeedResult> {
    this.logger.log('▶ Seed eldritch_invocations');
    return this.adminService.seedEldritchInvocations();
  }

  // ────── Fase 5 — Features, Spells, MagicItems, Monsters ──────

  @Post('features')
  @HttpCode(HttpStatus.OK)
  async seedFeatures(): Promise<SeedResult> {
    this.logger.log('▶ Seed features');
    return this.adminService.seedFeatures();
  }

  @Post('spells')
  @HttpCode(HttpStatus.OK)
  async seedSpells(): Promise<SeedResult> {
    this.logger.log('▶ Seed spells');
    return this.adminService.seedSpells();
  }

  @Post('magic-items')
  @HttpCode(HttpStatus.OK)
  async seedMagicItems(): Promise<SeedResult> {
    this.logger.log('▶ Seed magic_items');
    return this.adminService.seedMagicItems();
  }

  @Post('monsters')
  @HttpCode(HttpStatus.OK)
  async seedMonsters(): Promise<SeedResult> {
    this.logger.log('▶ Seed monsters');
    return this.adminService.seedMonsters();
  }

  // ────── Fase 6 — Levels ──────

  @Post('levels')
  @HttpCode(HttpStatus.OK)
  async seedLevels(): Promise<SeedResult> {
    this.logger.log('▶ Seed levels');
    return this.adminService.seedLevels();
  }

  // ────── Seed All — executa tudo na ordem correta ──────

  @Post('seed-all')
  @HttpCode(HttpStatus.OK)
  async seedAll(): Promise<{ results: SeedResult[]; summary: string }> {
    this.logger.log('▶▶▶ Seed ALL — iniciando...');
    const results: SeedResult[] = [];

    // Fase 0
    results.push(await this.adminService.seedCompSources());

    // Fase 1
    results.push(await this.adminService.seedAbilityScores());
    results.push(await this.adminService.seedAlignments());
    results.push(await this.adminService.seedConditions());
    results.push(await this.adminService.seedDamageTypes());
    results.push(await this.adminService.seedLanguages());
    results.push(await this.adminService.seedMagicSchools());
    results.push(await this.adminService.seedWeaponProperties());
    results.push(await this.adminService.seedWeaponMasteryProperties());
    results.push(await this.adminService.seedRuleSections());
    results.push(await this.adminService.seedEquipmentCategories());
    results.push(await this.adminService.seedProficiencies());

    // Fase 2
    results.push(await this.adminService.seedSkills());
    results.push(await this.adminService.seedEquipment());
    results.push(await this.adminService.seedFeats());
    results.push(await this.adminService.seedRules());

    // Fase 3
    results.push(await this.adminService.seedClasses());
    results.push(await this.adminService.seedRaces());

    // Fase 4
    results.push(await this.adminService.seedSubclasses());
    results.push(await this.adminService.seedSubraces());
    results.push(await this.adminService.seedTraits());
    results.push(await this.adminService.seedBackgrounds());
    results.push(await this.adminService.seedEldritchInvocations());

    // Fase 5
    results.push(await this.adminService.seedFeatures());
    results.push(await this.adminService.seedSpells());
    results.push(await this.adminService.seedMagicItems());
    results.push(await this.adminService.seedMonsters());

    // Fase 6
    results.push(await this.adminService.seedLevels());

    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
    const summary = `Seed completo: ${totalSuccess} registros OK, ${totalErrors} erros no total.`;
    this.logger.log(`▶▶▶ ${summary}`);

    return { results, summary };
  }
}
