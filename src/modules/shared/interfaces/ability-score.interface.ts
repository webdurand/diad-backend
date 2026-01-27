import { Skill } from './skill.interface';

export interface AbilityScore {
  id: string;
  index: string;
  name: string;
  full_name: string;
  description: string;
  skills: Skill[];
}
