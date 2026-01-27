import { APIReference } from './referente.interface';

export interface EquipmentCategory {
  index: string;
  name: string;
  equipment: APIReference[];
  url: string;
}
