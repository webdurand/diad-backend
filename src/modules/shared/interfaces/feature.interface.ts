import { APIReference } from './api-reference.interface';

export interface Feature extends APIReference {
  class: APIReference;
  name: string;
  level: number;
  desc: string[];
  prerequisites: any[];
  subclass?: APIReference;
  parent?: APIReference;
  reference?: string;
  feature_specific?: object;
}
