// Shared character ownership and state helpers — eliminates duplication across 4 services

import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { CharacterEntity, CharacterStateEntity } from "src/entities";

/**
 * Ensures the character belongs to the given user.
 * Throws NotFoundException if not found.
 */
export async function ensureCharacterOwnership(
  characterRepo: Repository<CharacterEntity>,
  userId: string,
  characterId: string,
  relations: string[] = [],
): Promise<CharacterEntity> {
  const character = await characterRepo.findOne({
    where: { id: characterId, userId },
    relations,
  });
  if (!character) {
    throw new NotFoundException("Personagem nao encontrado.");
  }
  return character;
}

/**
 * Fetches the character state or throws NotFoundException.
 */
export async function getCharacterState(
  stateRepo: Repository<CharacterStateEntity>,
  characterId: string,
): Promise<CharacterStateEntity> {
  const state = await stateRepo.findOne({
    where: { character_id: characterId },
  });
  if (!state) {
    throw new NotFoundException("Estado do personagem nao encontrado.");
  }
  return state;
}
