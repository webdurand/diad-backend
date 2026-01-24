export enum SkillNameEnum {
  // --- Força (Strength) ---
  ATHLETICS = 'athletics', // Atletismo

  // --- Destreza (Dexterity) ---
  ACROBATICS = 'acrobatics', // Acrobacia
  SLEIGHT_OF_HAND = 'sleight_of_hand', // Prestidigitação
  STEALTH = 'stealth', // Furtividade

  // --- Inteligência (Intelligence) ---
  ARCANA = 'arcana', // Arcanismo
  HISTORY = 'history', // História
  INVESTIGATION = 'investigation', // Investigação
  NATURE = 'nature', // Natureza
  RELIGION = 'religion', // Religião

  // --- Sabedoria (Wisdom) ---
  ANIMAL_HANDLING = 'animal_handling', // Adestrar Animais
  INSIGHT = 'insight', // Intuição
  MEDICINE = 'medicine', // Medicina
  PERCEPTION = 'perception', // Percepção
  SURVIVAL = 'survival', // Sobrevivência

  // --- Carisma (Charisma) ---
  DECEPTION = 'deception', // Enganação
  INTIMIDATION = 'intimidation', // Intimidação
  PERFORMANCE = 'performance', // Atuação
  PERSUASION = 'persuasion', // Persuasão
}

export type SkillName = `${SkillNameEnum}`;
