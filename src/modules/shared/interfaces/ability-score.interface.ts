import { APIReference } from './api-reference.interface';

export interface AbilityScore extends APIReference {
  full_name: string;
  description: string;
  skills: Skills[];
}

interface Skills extends APIReference {}
