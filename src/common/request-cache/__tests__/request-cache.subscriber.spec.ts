import type { DataSource, InsertEvent, UpdateEvent } from "typeorm";
import { CharacterEntity } from "src/entities/character.entity";
import { CharacterEquipmentEntity } from "src/entities/character-equipment.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { RequestCache } from "../request-cache.service";
import { RequestCacheSubscriber } from "../request-cache.subscriber";
import { asClsService, createActiveRequestCache, FakeClsService } from "./fake-cls";

function build(): {
  subscriber: RequestCacheSubscriber;
  cache: RequestCache;
  dataSource: { subscribers: unknown[] };
} {
  const { cache } = createActiveRequestCache();
  const dataSource = { subscribers: [] as unknown[] };
  const subscriber = new RequestCacheSubscriber(
    dataSource as unknown as DataSource,
    cache,
  );
  return { subscriber, cache, dataSource };
}

const loader = (value: string) => () => Promise.resolve(value);

describe("RequestCacheSubscriber", () => {
  it("registra-se no DataSource", () => {
    const { dataSource, subscriber } = build();
    expect(dataSource.subscribers).toContain(subscriber);
  });

  it("derruba a ficha quando QUALQUER tabela do personagem muda pelo ORM", async () => {
    const { subscriber, cache } = build();
    await cache.getOrLoad("sheet|char-1|user-1", loader("antiga"));

    // Este era o furo real: usar um item em combate decrementa
    // character_equipment.quantity e a ficha memoizada ficava com a
    // quantidade velha pelo resto da request.
    const equipment = Object.assign(new CharacterEquipmentEntity(), {
      id: "eq-1",
      character_id: "char-1",
      quantity: 1,
    });

    subscriber.afterUpdate({
      entity: equipment,
      databaseEntity: equipment,
    } as unknown as UpdateEvent<unknown>);

    const after = await cache.getOrLoad("sheet|char-1|user-1", loader("nova"));
    expect(after).toBe("nova");
  });

  it("nao derruba memo de outro personagem", async () => {
    const { subscriber, cache } = build();
    await cache.getOrLoad("sheet|char-2|user-1", loader("intacta"));

    subscriber.afterInsert({
      entity: { id: "eq-9", character_id: "char-1" },
    } as unknown as InsertEvent<unknown>);

    const after = await cache.getOrLoad("sheet|char-2|user-1", loader("nova"));
    expect(after).toBe("intacta");
  });

  it("aceita camelCase characterId", async () => {
    const { subscriber, cache } = build();
    await cache.getOrLoad("actions|char-3|user-1", loader("antiga"));

    subscriber.afterInsert({
      entity: { id: "x", characterId: "char-3" },
    } as unknown as InsertEvent<unknown>);

    const after = await cache.getOrLoad("actions|char-3|user-1", loader("nova"));
    expect(after).toBe("nova");
  });

  it("usa databaseEntity quando o save parcial nao traz as chaves", async () => {
    const { subscriber, cache } = build();
    await cache.getOrLoad("sheet|char-4|user-1", loader("antiga"));

    subscriber.afterUpdate({
      entity: { quantity: 2 },
      databaseEntity: { id: "eq-4", character_id: "char-4" },
    } as unknown as UpdateEvent<unknown>);

    const after = await cache.getOrLoad("sheet|char-4|user-1", loader("nova"));
    expect(after).toBe("nova");
  });

  it("escrita na propria CharacterEntity invalida pelo id", async () => {
    const { subscriber, cache } = build();
    await cache.getOrLoad("sheet|char-5|user-1", loader("antiga"));

    const character = Object.assign(new CharacterEntity(), { id: "char-5" });
    subscriber.afterUpdate({
      entity: character,
      databaseEntity: character,
    } as unknown as UpdateEvent<unknown>);

    const after = await cache.getOrLoad("sheet|char-5|user-1", loader("nova"));
    expect(after).toBe("nova");
  });

  it("escrita em participante invalida o memo de pre-voo daquele participante", async () => {
    const { subscriber, cache } = build();
    await cache.getOrLoad("participant|p-1", loader("antigo"));
    await cache.getOrLoad("participant|p-2", loader("outro"));

    const participant = Object.assign(new EncounterParticipantEntity(), {
      id: "p-1",
    });
    subscriber.afterUpdate({
      entity: participant,
      databaseEntity: participant,
    } as unknown as UpdateEvent<unknown>);

    expect(await cache.getOrLoad("participant|p-1", loader("novo"))).toBe(
      "novo",
    );
    expect(await cache.getOrLoad("participant|p-2", loader("novo"))).toBe(
      "outro",
    );
  });

  it("nao explode com entidade null ou sem ids", () => {
    const { subscriber } = build();
    expect(() =>
      subscriber.afterInsert({ entity: null } as unknown as InsertEvent<unknown>),
    ).not.toThrow();
    expect(() =>
      subscriber.afterInsert({
        entity: { foo: "bar" },
      } as unknown as InsertEvent<unknown>),
    ).not.toThrow();
  });

  it("fora de contexto de request nao faz nada e nao quebra", () => {
    const cache = new RequestCache(asClsService(new FakeClsService(false)));
    const subscriber = new RequestCacheSubscriber(
      { subscribers: [] } as unknown as DataSource,
      cache,
    );

    expect(() =>
      subscriber.afterInsert({
        entity: { id: "eq-1", character_id: "char-1" },
      } as unknown as InsertEvent<unknown>),
    ).not.toThrow();
  });
});
