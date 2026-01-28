import { Equipment } from './equipment.interface';

export interface EquipmentCategory {
  id: string;
  index: string;
  name: string;
  equipment: Equipment[];
}
