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

// O smartMap continua igual, ele já é genérico o suficiente!
async function smartMap<T extends ObjectLiteral>(
  repo: any,
  rawData: any[],
): Promise<T[]> {
  const metadata = repo.metadata;

  // Mapeia apenas colunas que NÃO são chave primária nem geradas
  const columns = metadata.columns
    .filter((col) => !col.isPrimary && !col.isGenerated)
    .map((col) => col.propertyName);

  // Mapeia relacionamentos
  const relations = metadata.relations.map((rel) => rel.propertyName);

  const mandatoryColumns = metadata.columns
    .filter((col) => !col.isNullable && !col.isGenerated && !col.isPrimary)
    .map((col) => col.propertyName);

  return rawData.map((item, index) => {
    const entity = repo.create();

    columns.forEach((col) => {
      if (item[col] !== undefined) {
        entity[col] = item[col];
      }
    });

    relations.forEach((rel) => {
      if (item[rel] !== undefined) {
        entity[rel] = item[rel];
      }
    });

    for (const col of mandatoryColumns) {
      if (entity[col] === undefined || entity[col] === null) {
        throw new BadRequestException(
          `Erro no item [${index}]: O campo '${col}' é obrigatório para ${metadata.name}.`,
        );
      }
    }

    return entity;
  });
}
@Injectable()
export class AdminService {
  // Injetamos o DataSource para acessar qualquer tabela/entidade
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * @param fileName Ex: 'ability-scores.json'
   * @param entityName Ex: 'AbilityScoreEntity' ou o nome da classe da Entity
   */
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

    // =================================================================================
    // LÓGICA DE PRÉ-CARREGAMENTO DE DEPENDÊNCIAS (LOOKUPS)
    // =================================================================================

    // --- EQUIPMENT: Precisa de Categories ---
    if (entityName === 'EquipmentEntity') {
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
    } else if (entityName === 'SubraceEntity') {
      console.log(' -> Vinculando Race, Traits e Languages para Subraces...');

      // 1. Carrega Races (Pai)
      const raceRepo = this.dataSource.getRepository(RaceEntity);
      const allRaces = await raceRepo.find({
        select: { id: true, index: true },
      });
      const raceMap = new Map(allRaces.map((r) => [r.index, r]));

      // 2. Carrega Traits
      const traitRepo = this.dataSource.getRepository(TraitEntity);
      const allTraits = await traitRepo.find({
        select: { id: true, index: true },
      });
      const traitMap = new Map(allTraits.map((t) => [t.index, t]));

      // 3. Carrega Languages (Algumas sub-raças dão idiomas extras)
      const langRepo = this.dataSource.getRepository(LanguageEntity);
      const allLangs = await langRepo.find({
        select: { id: true, index: true },
      });
      const langMap = new Map(allLangs.map((l) => [l.index, l]));

      dataArray.forEach((subrace) => {
        // Vincula a Raça Pai
        if (subrace.race && subrace.race.index) {
          subrace.race = raceMap.get(subrace.race.index);
        }

        // Vincula Traços (Nota: no JSON do SRD 5e, às vezes vem como 'racial_traits')
        const traitsJson = subrace.racial_traits || subrace.traits;
        if (traitsJson && Array.isArray(traitsJson)) {
          // Precisamos atribuir à propriedade correta da sua Entity (provavelmente 'traits')
          subrace.traits = traitsJson
            .map((t) => traitMap.get(t.index))
            .filter((f) => !!f);

          // Limpa a propriedade antiga para não dar erro se o nome for diferente
          if (subrace.racial_traits) delete subrace.racial_traits;
        }

        // Vincula Idiomas (language_options ou languages diretos)
        if (subrace.languages && Array.isArray(subrace.languages)) {
          subrace.languages = subrace.languages
            .map((l) => langMap.get(l.index))
            .filter((f) => !!f);
        }
      });
    }
    // trait aqui
    else if (entityName === 'TraitEntity') {
      console.log('[AdminService] Vinculando dependências para Traits...');

      const profRepo = this.dataSource.getRepository(ProficiencyEntity);
      const allProfs = await profRepo.find();
      const profMap = new Map(allProfs.map((p) => [p.index, p]));

      // NOVO: Tratamento de Parent (Auto-Referência)
      // Como Traits podem referenciar outras Traits no mesmo arquivo,
      // idealmente salvaríamos em duas passadas, mas para o insert inicial:
      const traitRepo = this.dataSource.getRepository(TraitEntity);
      const existingTraits = await traitRepo.find(); // Traits que já existem no banco
      const traitMap = new Map(existingTraits.map((t) => [t.index, t]));

      dataArray.forEach((trait) => {
        // Mapear Proficiencies
        if (trait.proficiencies && Array.isArray(trait.proficiencies)) {
          trait.proficiencies = trait.proficiencies
            .map((p) => profMap.get(p.index))
            .filter((f) => !!f);
        }

        // Mapear Parent
        if (trait.parent && trait.parent.index) {
          const parentEntity = traitMap.get(trait.parent.index);

          if (parentEntity) {
            // Se o pai já existe no banco, vincula.
            trait.parent = parentEntity;
          } else {
            // Se não existe (ex: é o Draconic Ancestry que está sendo criado agora),
            // definimos como null para não quebrar o save.
            // O TypeORM não vai tentar criar um "parent fantasma" incompleto.
            console.warn(
              `[AdminService] Parent trait '${trait.parent.index}' não encontrada no banco. Campo parent será ignorado.`,
            );
            trait.parent = null;
          }
        }
      });
    }
    // --- SKILL: Precisa de Ability Scores ---
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

    // --- RACE: Precisa de Languages e Traits ---
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

    // --- CLASS: Precisa de Proficiencies, AbilityScores (Saving Throws) e Equipment ---
    else if (entityName === 'ClassEntity') {
      console.log('[AdminService] Vinculando dependências para Classes...');

      // Repositório de Proficiências (para o campo 'proficiencies')
      const profRepo = this.dataSource.getRepository(ProficiencyEntity);
      const allProfs = await profRepo.find();
      const profMap = new Map(allProfs.map((p) => [p.index, p]));

      // Repositório de AbilityScores (para o campo 'saving_throws')
      const abilityRepo = this.dataSource.getRepository(AbilityScoreEntity);
      const allAbilities = await abilityRepo.find();
      const abilityMap = new Map(allAbilities.map((a) => [a.index, a]));

      // Repositório de Equipamentos (para 'starting_equipment')
      const equipRepo = this.dataSource.getRepository(EquipmentEntity);
      const allEquip = await equipRepo.find();
      const equipMap = new Map(allEquip.map((e) => [e.index, e]));

      dataArray.forEach((cls) => {
        // 1. Mapear Proficiencies
        if (cls.proficiencies && Array.isArray(cls.proficiencies)) {
          cls.proficiencies = cls.proficiencies
            .map((p) => profMap.get(p.index))
            .filter((f) => !!f);
        }

        // 2. Mapear Saving Throws (Agora usando AbilityScoreEntity)
        if (cls.saving_throws && Array.isArray(cls.saving_throws)) {
          cls.saving_throws = cls.saving_throws
            .map((st) => abilityMap.get(st.index)) // Ex: 'str', 'con'
            .filter((f) => !!f);
        }

        // 3. Mapear Starting Equipment
        if (cls.starting_equipment && Array.isArray(cls.starting_equipment)) {
          cls.starting_equipment = cls.starting_equipment
            .map((e) => {
              // O JSON vem aninhado: { equipment: { index: '...' }, quantity: 1 }
              // Mas a relação ManyToMany geralmente espera apenas a entidade.
              // Se você quiser salvar a quantidade, precisaria de uma tabela pivô 'ClassEquipment'.
              // Como sua entity é @ManyToMany simples, pegamos apenas o equipamento.
              return equipMap.get(e.equipment.index);
            })
            .filter((f) => !!f);
        }
      });
    }

    // --- FEATURE: Precisa de Class, Subclass (e Parent opcionalmente) ---
    else if (entityName === 'FeatureEntity') {
      console.log(
        '[AdminService] Vinculando Classes e Subclasses para Features...',
      );

      const classRepo = this.dataSource.getRepository(ClassEntity);
      const allClasses = await classRepo.find();
      const classMap = new Map(allClasses.map((c) => [c.index, c]));

      const subclassRepo = this.dataSource.getRepository(SubclassEntity);
      const allSubclasses = await subclassRepo.find();
      const subclassMap = new Map(allSubclasses.map((s) => [s.index, s]));

      dataArray.forEach((feat) => {
        if (feat.class && feat.class.index) {
          feat.class = classMap.get(feat.class.index);
        }
        if (feat.subclass && feat.subclass.index) {
          feat.subclass = subclassMap.get(feat.subclass.index);
        }
        // Evita erro de FK se o parent feature ainda não existir no banco
        if (feat.parent) {
          feat.parent = null;
        }
      });
    }

    // =================================================================================

    // 3. Processar e Salvar
    try {
      console.log(`[AdminService] Mapeando ${dataArray.length} registros...`);

      // Transforma JSON em objetos de Entidade (ainda sem ID)
      const validatedEntities = await smartMap(repository, dataArray);

      // ==============================================================================
      // CORREÇÃO PARA UPSERT (EVITAR ERRO DE DUPLICIDADE)
      // ==============================================================================
      console.log(
        `[AdminService] Verificando registros existentes para atualização...`,
      );

      // Busca apenas ID e Index de tudo que já existe nessa tabela
      const existingRecords = await repository.find({
        select: ['id', 'index'], // Seleciona apenas o necessário para performance
      });

      // Cria um mapa: "darkvision" -> "uuid-do-banco"
      const existingMap = new Map(existingRecords.map((e) => [e.index, e.id]));

      // Percorre o que vamos salvar e anexa o ID se já existir
      validatedEntities.forEach((entity) => {
        if (entity.index) {
          const foundId = existingMap.get(entity.index);
          if (foundId) {
            entity.id = foundId; // O TypeORM vê o ID e muda de INSERT para UPDATE
          }
        }
      });
      // ==============================================================================

      console.log(`[AdminService] Salvando no banco...`);

      // Agora o save() fará UPDATE nos que têm ID e INSERT nos novos
      const result = await repository.save(validatedEntities);

      console.log(
        `[AdminService] Sucesso! ${result.length} registros processados.`,
      );
      return result;
    } catch (error) {
      console.error(`[AdminService] Erro ao processar upload:`, error);

      // Detecção de duplicidade
      if (error && error.code === '23505') {
        const detail = error.detail || 'Chave duplicada encontrada';
        console.error(`[AdminService] Erro de Duplicidade: ${detail}`);
        throw new BadRequestException(`Registro duplicado: ${detail}`);
      }

      if (error instanceof BadRequestException) throw error;

      throw new InternalServerErrorException(
        `Erro ao salvar em ${entityName}: ${error.message}`,
      );
    }
  }

  async testEquipmentCategoryRelation() {
    const repo = this.dataSource.getRepository('EquipmentEntity');
    // Busca 5 equipamentos e popula a categoria
    const result = await repo.find({
      relations: ['equipment_categories'],
      take: 5,
    });
    // Retorna se pelo menos um equipamento tem categoria populada
    const allHaveCategory = result.every(
      (e) => e.equipment_categories && e.equipment_categories.length > 0,
    );
    return {
      total: result.length,
      allHaveCategory,
      sample: result.map((e) => ({
        name: e.name,
        category: e.equipment_categories
          ? e.equipment_categories.name || e.equipment_categories.index
          : null,
      })),
    };
  }

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
