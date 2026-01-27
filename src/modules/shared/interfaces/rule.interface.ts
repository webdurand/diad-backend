import { APIReference } from './api-reference.interface';

export interface Rule extends APIReference {
  desc: string;
  subsections: Subsection[];
}

export interface Subsection extends APIReference {}
