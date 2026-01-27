import { APIReference } from './api-reference.interface';

export interface Dc {
  dc_type: APIReference;
  dc_value?: number;
  success_type: string;
}
