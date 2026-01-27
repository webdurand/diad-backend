import { APIReference } from './api-reference.interface';
export interface EquipmentCategory extends APIReference {
  equipment: APIReference[];
}
