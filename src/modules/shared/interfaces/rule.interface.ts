import { RuleSection } from './rule-section.interface';

export interface Rule {
  id: string;
  index: string;
  name: string;
  desc: string;
  subsections: RuleSection[];
}
