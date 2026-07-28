import { Injectable } from "@nestjs/common";
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from "typeorm";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { RequestCache } from "./request-cache.service";

/**
 * Rede de segurança do memo por request: QUALQUER escrita via ORM derruba as
 * entradas derivadas da linha escrita.
 *
 * Por que escutar tudo em vez de só `character_state`: `computeSheet` lê 12
 * tabelas do personagem (classes, perícias, proficiências, magias, equipamento,
 * itens mágicos, features, origem, level-ups, ...). Escutar apenas o estado
 * deixava um furo real — usar um item em combate decrementa
 * `character_equipment.quantity` (`inventory.service.ts` useItem) e uma
 * releitura da ficha na MESMA request devolveria a quantidade antiga.
 *
 * O custo é desprezível: por escrita, uma varredura de um Map que tem poucas
 * dezenas de chaves e vive só durante a request.
 *
 * ATENÇÃO: subscriber do TypeORM NÃO dispara para SQL cru (`manager.query`,
 * `createQueryBuilder().update()`). Writers nesse formato precisam invalidar à
 * mão — ver `character-state.service.ts` (`incrementFeatureUses`, jsonb_set).
 */
@Injectable()
export class RequestCacheSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly requestCache: RequestCache,
  ) {
    dataSource.subscribers.push(this);
  }

  // Sem listenTo(): escuta todas as entidades.

  afterInsert(event: InsertEvent<unknown>): void {
    this.invalidate(event.entity);
  }

  afterUpdate(event: UpdateEvent<unknown>): void {
    // Em save() parcial, `entity` pode não trazer as chaves; o row do banco tem.
    this.invalidate(event.entity, event.databaseEntity);
  }

  afterRemove(event: RemoveEvent<unknown>): void {
    this.invalidate(event.entity, event.databaseEntity);
  }

  private invalidate(...candidates: unknown[]): void {
    for (const candidate of candidates) {
      if (!isRecord(candidate)) continue;

      const characterId =
        readId(candidate, "character_id") ?? readId(candidate, "characterId");
      if (characterId) this.requestCache.invalidateCharacter(characterId);

      const ownId = readId(candidate, "id");
      if (!ownId) continue;

      if (candidate instanceof CharacterEntity) {
        this.requestCache.invalidateCharacter(ownId);
      }
      if (candidate instanceof EncounterParticipantEntity) {
        this.requestCache.invalidateParticipant(ownId);
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readId(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
