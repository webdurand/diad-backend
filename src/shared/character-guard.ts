// Shared character ownership and state helpers — eliminates duplication across 4 services

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { In, Repository } from "typeorm";
import {
  CampaignPartyMemberEntity,
  CharacterEntity,
  CharacterStateEntity,
} from "src/entities";

/**
 * Ensures the character belongs to the given user.
 * Throws NotFoundException if not found.
 */
export async function ensureCharacterReadAccess(
  characterRepo: Repository<CharacterEntity>,
  userId: string,
  characterId: string,
  partyRepo: Repository<CampaignPartyMemberEntity>,
  relations: string[] = [],
): Promise<CharacterEntity> {
  const character = await characterRepo.findOne({
    where: { id: characterId },
    relations,
  });
  if (!character || character.userId !== userId)
    throw new NotFoundException("Personagem nao encontrado.");

  if (character.ownerType !== "companion") return character;

  const member = await partyRepo.findOne({
    where: {
      companionCharacterId: characterId,
      state: In(["active", "roster"]),
    },
  });
  if (!member) throw new NotFoundException("Personagem nao encontrado.");
  return character;
}

export async function ensureCharacterWriteAccess(
  characterRepo: Repository<CharacterEntity>,
  userId: string,
  characterId: string,
  partyRepo: Repository<CampaignPartyMemberEntity>,
  relations: string[] = [],
): Promise<CharacterEntity> {
  const character = await characterRepo.findOne({
    where: { id: characterId },
    relations,
  });
  if (!character || character.userId !== userId)
    throw new NotFoundException("Personagem nao encontrado.");

  if (character.ownerType !== "companion") return character;

  const member = await partyRepo.findOne({
    where: { companionCharacterId: characterId },
  });
  if (!member || member.state === "dismissed") {
    throw new NotFoundException("Personagem nao encontrado.");
  }
  if (member.state !== "active") {
    throw new ForbiddenException({
      ok: false,
      code: "COMPANION_INACTIVE",
      message: "Companion precisa estar ativo para alterar a ficha.",
    });
  }
  return character;
}

/**
 * Legacy PC-only guard kept for old call sites. New character sheet mutations
 * should use ensureCharacterReadAccess/ensureCharacterWriteAccess.
 */
export async function ensureCharacterOwnership(
  characterRepo: Repository<CharacterEntity>,
  userId: string,
  characterId: string,
  relations: string[] = [],
): Promise<CharacterEntity> {
  const character = await characterRepo.findOne({
    where: { id: characterId, userId, ownerType: "pc" },
    relations,
  });
  if (!character) throw new NotFoundException("Personagem nao encontrado.");
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
