import { APIReference } from './api-reference.interface';

export interface Language extends APIReference {
  is_rare: boolean;
  note: string;
}
