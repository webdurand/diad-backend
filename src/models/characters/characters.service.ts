import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterEntity } from 'src/entities';

interface CreateCharacterInput {
  userId: string;
  name: string;
  data: Record<string, unknown>;
}

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepository: Repository<CharacterEntity>,
  ) {}

  async listByUser(userId: string): Promise<CharacterEntity[]> {
    return this.characterRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(userId: string, id: string): Promise<CharacterEntity> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
    });
    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }
    return character;
  }

  async create(input: CreateCharacterInput): Promise<CharacterEntity> {
    if (!input.name?.trim()) {
      throw new BadRequestException('Nome do personagem e obrigatorio.');
    }

    const character = this.characterRepository.create({
      userId: input.userId,
      name: input.name.trim(),
      data: input.data ?? {},
    });

    return this.characterRepository.save(character);
  }
}
