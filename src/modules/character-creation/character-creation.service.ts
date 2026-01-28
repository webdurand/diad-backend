import { Injectable } from '@nestjs/common';
import { SharedService } from '../shared/shared.service';

@Injectable()
export class CharacterCreationService {
  constructor(private readonly shared: SharedService) {}

  async get(entity: string) {
    return this.shared.findAll(entity);
  }
}
