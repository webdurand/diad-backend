import { ArmorTypeEnum, ToolNameEnum, WeaponTypeEnum } from './items';
import { ClassChoice } from './classes'; // Reutilizando a interface de escolhas

export interface SubclassFeature {
  level: number;
  id: string;
  name: string;
  description: string;
  // Se essa feature exige uma escolha (ex: Totem do Urso vs Águia)
  choices?: ClassChoice;
}

export interface SubclassDefinition {
  id: string;
  parent_class_id: string; // Ex: 'barbarian'
  name: string;
  description: string;

  features: SubclassFeature[];

  // Proficiências extras (comum em Clérigos e alguns Bardos)
  extra_proficiencies?: {
    armor?: ArmorTypeEnum[];
    weapons?: WeaponTypeEnum[];
    tools?: ToolNameEnum[];
  };

  // Magias concedidas pela subclasse (Ex: Domínios de Clérigo, Patronos de Bruxo)
  // Mapeado por Nível de Personagem -> Lista de IDs de Magias
  additional_spells?: Record<number, string[]>;
}
