import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral } from 'typeorm';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { EquipmentEntity } from '../shared/entities/equipment.entity';
import { ClassEntity } from '../shared/entities/class.entity';
import { SubclassEntity } from '../shared/entities/subclass.entity';
import { EquipmentCategoryEntity } from '../shared/entities/equipment-category.entity';
import { LanguageEntity } from '../shared/entities/language.entity';
import { TraitEntity } from '../shared/entities/trait.entity';
import { ProficiencyEntity } from '../shared/entities/proficiency.entity';
import { AbilityScoreEntity } from '../shared/entities/ability-score.entity';
import { RaceEntity } from '../shared/entities/race.entity';
import { FeatureEntity } from '../shared/entities/feature.entity';
import { MagicItemEntity } from '../shared/entities/magic-item.entity';
import { RuleSectionEntity } from '../shared/entities/rule-section.entity';
import { MagicSchoolEntity } from '../shared/entities/magic-school.entity';

// Função smartMap atualizada para ler snake_case do banco e propertyName da classe
async function smartMap<T extends ObjectLiteral>(
  repo: any,
  rawData: any[],
): Promise<T[]> {
  const metadata = repo.metadata;

  // Filtra colunas
  const validColumns = metadata.columns.filter(
    (col) => !col.isPrimary && !col.isGenerated,
  );

  const relations = metadata.relations.map((rel) => rel.propertyName);

  return rawData.map((item, index) => {
    const entity: any = {};

    // 1. Mapear Colunas
    validColumns.forEach((col) => {
      const propName = col.propertyName;
      const dbName = col.databaseName;

      // Prioridade: Nome da Propriedade -> Nome do Banco
      if (item[propName] !== undefined) {
        entity[propName] = item[propName];
      } else if (dbName && item[dbName] !== undefined) {
        entity[propName] = item[dbName];
      }
    });

    // 2. Mapear Relações (class, etc)
    relations.forEach((rel) => {
      if (item[rel] !== undefined) {
        entity[rel] = item[rel];
      }
    });

    // --- DEBUG: Mostra o que foi gerado para o primeiro item ---
    if (index === 0) {
      console.log('--- DEBUG SMARTMAP (Primeiro Item) ---');
      console.log(
        'Item Original (JSON):',
        JSON.stringify(item).substring(0, 100) + '...',
      );
      console.log('Entidade Gerada:', entity);
      console.log(
        'Colunas Válidas detectadas na Entity:',
        validColumns.map((c) => c.propertyName),
      );
      console.log('--------------------------------------');
    }

    // Se o objeto estiver vazio, avisa
    if (Object.keys(entity).length === 0) {
      console.warn(`[Aviso] Item index ${index} gerou um objeto vazio!`);
    }

    return entity;
  });
}
@Injectable()
export class AdminService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async uploadFromJsonFile(fileName: string, entityName: string): Promise<any> {
    const filePath = join(process.cwd(), 'src', 'data', 'json', fileName);

    // 1. Obter Repositório
    let repository;
    try {
      repository = this.dataSource.getRepository(entityName);
    } catch (error) {
      throw new BadRequestException(
        `Entidade '${entityName}' não encontrada no sistema.`,
      );
    }

    // 2. Ler Arquivo
    let rawData: any;
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      rawData = JSON.parse(fileContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`Arquivo não encontrado em: ${filePath}`);
      }
      throw new BadRequestException(`Erro no JSON: ${error.message}`);
    }

    const dataArray = Array.isArray(rawData) ? rawData : [rawData];
    if (entityName === 'FeatureEntity') {
      console.log(
        ' -> Vinculando Classes, Subclasses e Parents para Features...',
      );

      const classRepo = this.dataSource.getRepository(ClassEntity);
      const allClasses = await classRepo.find({
        select: { id: true, index: true },
      });
      const classMap = new Map(allClasses.map((c) => [c.index, c]));

      const subclassRepo = this.dataSource.getRepository(SubclassEntity);
      const allSubclasses = await subclassRepo.find({
        select: { id: true, index: true },
      });
      const subclassMap = new Map(allSubclasses.map((s) => [s.index, s]));

      // NOVO: Carregar Features existentes para o Parent
      const featureRepo = this.dataSource.getRepository(FeatureEntity);
      const existingFeatures = await featureRepo.find({
        select: { id: true, index: true },
      });
      const featureMap = new Map(existingFeatures.map((f) => [f.index, f]));

      dataArray.forEach((feat) => {
        // Class
        if (feat.class && feat.class.index) {
          feat.class = classMap.get(feat.class.index);
        }

        // Subclass
        if (feat.subclass && feat.subclass.index) {
          feat.subclass = subclassMap.get(feat.subclass.index);
        }

        // Parent (Auto-Referência)
        if (feat.parent && feat.parent.index) {
          const parentEntity = featureMap.get(feat.parent.index);

          if (parentEntity) {
            feat.parent = parentEntity;
          } else {
            // Se não achou (ex: pai está sendo criado agora), ignora na primeira passada
            console.warn(
              `[Aviso] Parent feature '${feat.parent.index}' não encontrada. Campo ignorado.`,
            );
            feat.parent = null;
          }
        }
      });
    } else if (entityName === 'RuleEntity') {
      console.log('[AdminService] Vinculando Subsections para Rules...');

      const sectionRepo = this.dataSource.getRepository(RuleSectionEntity);
      // Otimização: Select apenas ID e Index
      const allSections = await sectionRepo.find({
        select: { id: true, index: true },
      });
      const sectionMap = new Map(allSections.map((s) => [s.index, s]));

      dataArray.forEach((rule) => {
        // Mapear Subsections (ManyToMany)
        if (rule.subsections && Array.isArray(rule.subsections)) {
          rule.subsections = rule.subsections
            .map((subJson) => sectionMap.get(subJson.index))
            .filter((f) => !!f);
        }
      });
    } else if (entityName === 'MagicItemEntity') {
      console.log(
        ' -> Vinculando Equipment Categories e Variantes para Magic Items...',
      );

      // 1. Carregar Categories
      const catRepo = this.dataSource.getRepository(EquipmentCategoryEntity);
      const allCats = await catRepo.find({ select: { id: true, index: true } });
      const catMap = new Map(allCats.map((c) => [c.index, c]));

      // 2. Carregar Magic Items existentes (para vincular variantes na 2ª passada)
      const magicItemRepo = this.dataSource.getRepository(MagicItemEntity);
      const existingItems = await magicItemRepo.find({
        select: { id: true, index: true },
      });
      const magicItemMap = new Map(existingItems.map((m) => [m.index, m]));

      dataArray.forEach((item) => {
        // Vincula Equipment Category
        if (item.equipment_category && item.equipment_category.index) {
          item.equipment_category = catMap.get(item.equipment_category.index);
        }

        // Vincula Variantes (Many-to-Many Auto-Relacionamento)
        if (item.variants && Array.isArray(item.variants)) {
          // Filtra e mapeia apenas os itens que JÁ existem no banco
          item.variants = item.variants
            .map((variantJson) => magicItemMap.get(variantJson.index))
            .filter((v) => !!v);
        }
      });
    } else if (
      entityName === 'WeaponPropertyEntity' ||
      entityName === 'WeaponMasteryPropertyEntity'
    ) {
      console.log(
        `[AdminService] Normalizando descrição para ${entityName}...`,
      );

      dataArray.forEach((item) => {
        // O JSON traz "desc", mas a Entity espera "description"
        if (item.desc) {
          // Se for array (padrão do SRD), junta com quebra de linha. Se for string, usa direto.
          item.description = Array.isArray(item.desc)
            ? item.desc.join('\n')
            : item.desc;
        }
      });
    } else if (entityName === 'EquipmentEntity') {
      console.log('[AdminService] Vinculando Categorias para Equipamentos...');
      const catRepo = this.dataSource.getRepository(EquipmentCategoryEntity);
      const allCats = await catRepo.find();
      const catMap = new Map(allCats.map((c) => [c.index, c]));

      dataArray.forEach((item) => {
        if (
          item.equipment_categories &&
          Array.isArray(item.equipment_categories)
        ) {
          item.equipment_categories = item.equipment_categories
            .map((c) => catMap.get(c.index))
            .filter((found) => !!found);
        }
      });
    } else if (entityName === 'RuleSectionEntity') {
      console.log('[AdminService] Normalizando campos de RuleSection...');

      dataArray.forEach((section) => {
        // O JSON traz "desc", mas a Entity espera "description"
        if (section.desc && !section.description) {
          section.description = section.desc;
        }
      });
    } else if (entityName === 'SpellEntity') {
      console.log(' -> Vinculando School, Classes e Subclasses para Spells...');

      // 1. Carregar Escolas de Magia
      const schoolRepo = this.dataSource.getRepository(MagicSchoolEntity);
      const allSchools = await schoolRepo.find({
        select: { id: true, index: true },
      });
      const schoolMap = new Map(allSchools.map((s) => [s.index, s]));

      // 2. Carregar Classes
      const classRepo = this.dataSource.getRepository(ClassEntity);
      const allClasses = await classRepo.find({
        select: { id: true, index: true },
      });
      const classMap = new Map(allClasses.map((c) => [c.index, c]));

      // 3. Carregar Subclasses
      const subclassRepo = this.dataSource.getRepository(SubclassEntity);
      const allSubclasses = await subclassRepo.find({
        select: { id: true, index: true },
      });
      const subclassMap = new Map(allSubclasses.map((s) => [s.index, s]));

      dataArray.forEach((spell) => {
        // Vincular Escola (ManyToOne)
        if (spell.school && spell.school.index) {
          spell.school = schoolMap.get(spell.school.index);
        }

        // Vincular Classes (ManyToMany)
        if (spell.classes && Array.isArray(spell.classes)) {
          spell.classes = spell.classes
            .map((c) => classMap.get(c.index))
            .filter((c) => !!c);
        }

        // Vincular Subclasses (ManyToMany)
        if (spell.subclasses && Array.isArray(spell.subclasses)) {
          spell.subclasses = spell.subclasses
            .map((s) => subclassMap.get(s.index))
            .filter((s) => !!s);
        }

        // --- Limpeza de campos opcionais que podem vir nulos ou vazios ---
        // O JSON do SRD 5e às vezes omite campos em vez de mandar null.
        // O TypeORM geralmente lida bem, mas para garantir:
        if (!spell.higher_level) spell.higher_level = null;
        if (!spell.material) spell.material = null;
        if (!spell.attack_type) spell.attack_type = null;
        if (!spell.damage) spell.damage = null;
        if (!spell.dc) spell.dc = null;
        if (!spell.heal_at_slot_level) spell.heal_at_slot_level = null;
        if (!spell.area_of_effect) spell.area_of_effect = null;
      });
    } else if (entityName === 'SubraceEntity') {
      console.log(' -> Vinculando Race e Traits para Subraces...');
      const raceRepo = this.dataSource.getRepository(RaceEntity);
      const allRaces = await raceRepo.find({
        select: { id: true, index: true },
      });
      const raceMap = new Map(allRaces.map((r) => [r.index, r]));

      const traitRepo = this.dataSource.getRepository(TraitEntity);
      const allTraits = await traitRepo.find({
        select: { id: true, index: true },
      });
      const traitMap = new Map(allTraits.map((t) => [t.index, t]));

      dataArray.forEach((subrace) => {
        if (subrace.race && subrace.race.index) {
          subrace.race = raceMap.get(subrace.race.index);
        }
        const traitsJson = subrace.racial_traits || subrace.traits;
        if (traitsJson && Array.isArray(traitsJson)) {
          subrace.racial_traits = traitsJson.map((t) => traitMap.get(t.index)).filter((f) => !!f);
        }
      });
    }

    // --- CLASS (Classes dependem de Proficiencies, AbilityScores, Equipment) ---
    else if (entityName === 'ClassEntity') {
      console.log('[AdminService] Vinculando dependências para Classes...');
      const profRepo = this.dataSource.getRepository(ProficiencyEntity);
      const allProfs = await profRepo.find();
      const profMap = new Map(allProfs.map((p) => [p.index, p]));

      const abilityRepo = this.dataSource.getRepository(AbilityScoreEntity);
      const allAbilities = await abilityRepo.find();
      const abilityMap = new Map(allAbilities.map((a) => [a.index, a]));

      const equipRepo = this.dataSource.getRepository(EquipmentEntity);
      const allEquip = await equipRepo.find();
      const equipMap = new Map(allEquip.map((e) => [e.index, e]));

      dataArray.forEach((cls) => {
        if (cls.proficiencies && Array.isArray(cls.proficiencies)) {
          cls.proficiencies = cls.proficiencies
            .map((p) => profMap.get(p.index))
            .filter((f) => !!f);
        }
        if (cls.saving_throws && Array.isArray(cls.saving_throws)) {
          cls.saving_throws = cls.saving_throws
            .map((st) => abilityMap.get(st.index))
            .filter((f) => !!f);
        }
        if (cls.starting_equipment && Array.isArray(cls.starting_equipment)) {
          cls.starting_equipment = cls.starting_equipment
            .map((e) => equipMap.get(e.equipment.index))
            .filter((f) => !!f);
        }
      });
    }

    // --- SUBCLASS (NOVO: Subclasses dependem de Classes) ---
    else if (entityName === 'SubclassEntity') {
      console.log('[AdminService] Vinculando Classes para Subclasses...');
      const classRepo = this.dataSource.getRepository(ClassEntity);
      const allClasses = await classRepo.find({
        select: { id: true, index: true },
      });
      const classMap = new Map(allClasses.map((c) => [c.index, c]));

      dataArray.forEach((sub) => {
        // O JSON vem como: "class": { "index": "barbarian", ... }
        if (sub.class && sub.class.index) {
          const foundClass = classMap.get(sub.class.index);
          if (foundClass) {
            sub.class = foundClass;
          } else {
            console.warn(
              `[Aviso] Classe '${sub.class.index}' não encontrada para a subclasse '${sub.index}'.`,
            );
            sub.class = null;
          }
        }
      });
    }

    // --- LEVEL (Levels dependem de Classes e Subclasses) ---
    else if (entityName === 'LevelEntity') {
      console.log(' -> Vinculando Features, Class e Subclass para Levels...');

      const classRepo = this.dataSource.getRepository(ClassEntity);
      const allClasses = await classRepo.find({
        select: { id: true, index: true },
      });
      const classMap = new Map(allClasses.map((c) => [c.index, c]));

      const subclassRepo = this.dataSource.getRepository(SubclassEntity);
      const allSubclasses = await subclassRepo.find({
        select: { id: true, index: true },
      });
      const subclassMap = new Map(allSubclasses.map((s) => [s.index, s]));

      const featureRepo = this.dataSource.getRepository(FeatureEntity);
      const allFeatures = await featureRepo.find({
        select: { id: true, index: true },
      });
      const featureMap = new Map(allFeatures.map((f) => [f.index, f]));

      dataArray.forEach((lvl) => {
        // CORREÇÃO DE VALORES PADRÃO (Para evitar erro de NOT NULL)
        if (
          lvl.ability_score_bonuses === undefined ||
          lvl.ability_score_bonuses === null
        ) {
          lvl.ability_score_bonuses = 0;
        }
        if (lvl.prof_bonus === undefined || lvl.prof_bonus === null) {
          lvl.prof_bonus = 0;
        }

        // Vincular Class
        if (lvl.class && lvl.class.index) {
          const foundClass = classMap.get(lvl.class.index);
          if (foundClass) {
            lvl.class = foundClass;
          } else {
            // Se não achar a classe, vai dar erro no banco, então é bom avisar
            console.warn(
              `[Aviso] Classe '${lvl.class.index}' não encontrada para Level.`,
            );
          }
        }

        // Vincular Subclass
        if (lvl.subclass && lvl.subclass.index) {
          lvl.subclass = subclassMap.get(lvl.subclass.index);
        }

        // Vincular Features
        if (lvl.features && Array.isArray(lvl.features)) {
          lvl.features = lvl.features
            .map((featJson) => featureMap.get(featJson.index))
            .filter((f) => !!f);
        }
      });
    }

    // --- TRAIT ---
    else if (entityName === 'TraitEntity') {
      console.log('[AdminService] Vinculando dependências para Traits...');
      const profRepo = this.dataSource.getRepository(ProficiencyEntity);
      const allProfs = await profRepo.find();
      const profMap = new Map(allProfs.map((p) => [p.index, p]));

      const traitRepo = this.dataSource.getRepository(TraitEntity);
      const existingTraits = await traitRepo.find();
      const traitMap = new Map(existingTraits.map((t) => [t.index, t]));

      dataArray.forEach((trait) => {
        if (trait.proficiencies && Array.isArray(trait.proficiencies)) {
          trait.proficiencies = trait.proficiencies
            .map((p) => profMap.get(p.index))
            .filter((f) => !!f);
        }
        if (trait.parent && trait.parent.index) {
          const parentEntity = traitMap.get(trait.parent.index);
          if (parentEntity) {
            trait.parent = parentEntity;
          } else {
            trait.parent = null;
          }
        }
      });
    }

    // --- SKILL ---
    else if (entityName === 'SkillEntity') {
      console.log('[AdminService] Vinculando Ability Scores para Skills...');
      const abilityRepo = this.dataSource.getRepository(AbilityScoreEntity);
      const allAbilities = await abilityRepo.find();
      const abilityMap = new Map(allAbilities.map((a) => [a.index, a]));

      dataArray.forEach((item) => {
        if (item.ability_score && item.ability_score.index) {
          item.ability_score = abilityMap.get(item.ability_score.index);
        }
      });
    }

    // --- RACE ---
    else if (entityName === 'RaceEntity') {
      console.log('[AdminService] Vinculando Languages e Traits para Races...');
      const langRepo = this.dataSource.getRepository(LanguageEntity);
      const allLangs = await langRepo.find();
      const langMap = new Map(allLangs.map((l) => [l.index, l]));

      const traitRepo = this.dataSource.getRepository(TraitEntity);
      const allTraits = await traitRepo.find();
      const traitMap = new Map(allTraits.map((t) => [t.index, t]));

      dataArray.forEach((race) => {
        if (race.languages && Array.isArray(race.languages)) {
          race.languages = race.languages
            .map((l) => langMap.get(l.index))
            .filter((f) => !!f);
        }
        if (race.traits && Array.isArray(race.traits)) {
          race.traits = race.traits
            .map((t) => traitMap.get(t.index))
            .filter((f) => !!f);
        }
      });
    }

    // --- FEATURE ---
    else if (entityName === 'FeatureEntity') {
      console.log(
        '[AdminService] Vinculando Classes e Subclasses para Features...',
      );
      const classRepo = this.dataSource.getRepository(ClassEntity);
      const allClasses = await classRepo.find({
        select: { id: true, index: true },
      });
      const classMap = new Map(allClasses.map((c) => [c.index, c]));

      const subclassRepo = this.dataSource.getRepository(SubclassEntity);
      const allSubclasses = await subclassRepo.find({
        select: { id: true, index: true },
      });
      const subclassMap = new Map(allSubclasses.map((s) => [s.index, s]));

      dataArray.forEach((feat) => {
        if (feat.class && feat.class.index) {
          feat.class = classMap.get(feat.class.index);
        }
        if (feat.subclass && feat.subclass.index) {
          feat.subclass = subclassMap.get(feat.subclass.index);
        }
        if (feat.parent) {
          feat.parent = null;
        }
      });
    }

    // =================================================================================

    // 3. Processar e Salvar
    try {
      console.log(`[AdminService] Mapeando ${dataArray.length} registros...`);

      // Transforma JSON em Objetos Simples (POJO)
      const validatedEntities = await smartMap(repository, dataArray);

      // ==============================================================================
      // CORREÇÃO PARA UPSERT
      // ==============================================================================
      console.log(
        `[AdminService] Verificando registros existentes para atualização...`,
      );

      const existingRecords = await repository.find({
        select: ['id', 'index'],
      });

      const existingMap = new Map(existingRecords.map((e) => [e.index, e.id]));

      validatedEntities.forEach((entity) => {
        if (entity.index) {
          const foundId = existingMap.get(entity.index);
          if (foundId) {
            entity.id = foundId;
          }
        }
      });
      // ==============================================================================

      console.log(`[AdminService] Salvando no banco...`);

      console.log(`[AdminService] Salvando no banco...`);

      // DEBUG: Verifique se o primeiro item tem dados além do ID
      if (validatedEntities.length > 0) {
        console.log(
          'Amostra do objeto a ser salvo:',
          JSON.stringify(validatedEntities[0], null, 2),
        );
      }

      const result = await repository.save(validatedEntities);
      console.log(
        `[AdminService] Sucesso! ${result.length} registros processados.`,
      );
      return result;
    } catch (error) {
      console.error(`[AdminService] Erro ao processar upload:`, error);

      if (error && error.code === '23505') {
        const detail = error.detail || 'Chave duplicada encontrada';
        throw new BadRequestException(`Registro duplicado: ${detail}`);
      }

      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException(
        `Erro ao salvar em ${entityName}: ${error.message}`,
      );
    }
  }

  // Seus métodos auxiliares continuam abaixo...
  async returnAll(entityName: string): Promise<any[]> {
    let repository;
    try {
      repository = this.dataSource.getRepository(entityName);
    } catch (error) {
      throw new BadRequestException(
        `Entidade '${entityName}' não encontrada no sistema.`,
      );
    }
    return repository.find();
  }

  async clearTable(entityName: string): Promise<void> {
    let repository;
    try {
      repository = this.dataSource.getRepository(entityName);
    } catch (error) {
      throw new BadRequestException(
        `Entidade '${entityName}' não encontrada no sistema.`,
      );
    }
    await repository.createQueryBuilder().delete().execute();
  }
}
