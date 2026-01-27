import { APIReference } from './api-reference.interface';

export interface AbilityScore {
  index: string;
  name: string;
  full_name: string;
  description: string;
  skills: APIReference[];
  url: string;
}
