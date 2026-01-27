import { APIReference } from './api-reference.interface';

export interface EquipmentCategory {
  index: string;
  name: string;
  equipment: APIReference[];
  url: string;
}
