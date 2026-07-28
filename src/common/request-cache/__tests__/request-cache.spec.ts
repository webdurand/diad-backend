import { RequestCache } from "../request-cache.service";
import { createActiveRequestCache, type FakeClsService } from "./fake-cls";

describe("RequestCache", () => {
  let cls: FakeClsService;
  let cache: RequestCache;

  beforeEach(() => {
    // O fake tem store real em Map e `isActive()` alternável, para cobrir os
    // dois regimes do memo (dentro e fora de uma request).
    ({ cache, cls } = createActiveRequestCache());
  });

  describe("getOrLoad dentro de um contexto CLS", () => {
    it("executa o loader uma única vez e devolve o mesmo valor", async () => {
      const value = { hp: 12 };
      const loader = jest.fn().mockResolvedValue(value);

      const first = await cache.getOrLoad("sheet|char-1|user-1", loader);
      const second = await cache.getOrLoad("sheet|char-1|user-1", loader);

      expect(loader).toHaveBeenCalledTimes(1);
      // Identidade do objeto: o segundo chamador recebe a MESMA instância, é
      // isso que colapsa os 6-10 computeSheet de um attack em um só.
      expect(second).toBe(first);
    });

    it("compartilha a promise pendente entre chamadas concorrentes", async () => {
      let release: (value: { hp: number }) => void = () => undefined;
      const loader = jest.fn(
        () =>
          new Promise<{ hp: number }>((resolve) => {
            release = resolve;
          }),
      );

      const first = cache.getOrLoad("sheet|char-1|user-1", loader);
      const second = cache.getOrLoad("sheet|char-1|user-1", loader);

      // O segundo chamador entra antes de o loader resolver: ainda assim só
      // pode existir um round-trip ao banco.
      expect(loader).toHaveBeenCalledTimes(1);

      release({ hp: 7 });
      expect(await second).toBe(await first);
    });

    it("isola chaves diferentes", async () => {
      const loader = jest
        .fn()
        .mockResolvedValueOnce("ficha")
        .mockResolvedValueOnce("acoes");

      await expect(
        cache.getOrLoad("sheet|char-1|user-1", loader),
      ).resolves.toBe("ficha");
      await expect(
        cache.getOrLoad("actions|char-1|user-1", loader),
      ).resolves.toBe("acoes");
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe("getOrLoad fora de um contexto CLS", () => {
    beforeEach(() => {
      cls.active = false;
    });

    it("é transparente: o loader roda em toda chamada", async () => {
      const loader = jest.fn().mockResolvedValue("ficha");

      await cache.getOrLoad("sheet|char-1|user-1", loader);
      await cache.getOrLoad("sheet|char-1|user-1", loader);

      // Loops de turno de IA, gateway de socket e jobs rodam fora de CLS e
      // precisam continuar lendo estado fresco a cada passo.
      expect(loader).toHaveBeenCalledTimes(2);
      expect(cls.values.size).toBe(0);
    });

    it("não quebra quando não há ClsService injetado", async () => {
      const cacheWithoutCls = new RequestCache();
      const loader = jest.fn().mockResolvedValue("ficha");

      await expect(
        cacheWithoutCls.getOrLoad("sheet|char-1|user-1", loader),
      ).resolves.toBe("ficha");
      expect(() => cacheWithoutCls.invalidateCharacter("char-1")).not.toThrow();
    });
  });

  describe("loader que rejeita", () => {
    it("não memoiza a falha: a chamada seguinte tenta de novo", async () => {
      const loader = jest
        .fn()
        .mockRejectedValueOnce(new Error("falha transitória"))
        .mockResolvedValueOnce("ficha");

      await expect(
        cache.getOrLoad("sheet|char-1|user-1", loader),
      ).rejects.toThrow("falha transitória");
      await expect(
        cache.getOrLoad("sheet|char-1|user-1", loader),
      ).resolves.toBe("ficha");
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe("invalidateCharacter", () => {
    it("derruba somente as chaves que contêm |<characterId>", async () => {
      const sheetOne = jest.fn().mockResolvedValue("ficha-1");
      const actionsOne = jest.fn().mockResolvedValue("acoes-1");
      const sheetTwo = jest.fn().mockResolvedValue("ficha-2");

      await cache.getOrLoad("sheet|char-1|user-1", sheetOne);
      await cache.getOrLoad("actions|char-1|user-1", actionsOne);
      await cache.getOrLoad("sheet|char-2|user-1", sheetTwo);

      cache.invalidateCharacter("char-1");

      await cache.getOrLoad("sheet|char-1|user-1", sheetOne);
      await cache.getOrLoad("actions|char-1|user-1", actionsOne);
      await cache.getOrLoad("sheet|char-2|user-1", sheetTwo);

      expect(sheetOne).toHaveBeenCalledTimes(2);
      expect(actionsOne).toHaveBeenCalledTimes(2);
      // O personagem que não sofreu escrita continua memoizado.
      expect(sheetTwo).toHaveBeenCalledTimes(1);
    });

    it("ignora id vazio para não limpar o memo inteiro por engano", async () => {
      const loader = jest.fn().mockResolvedValue("ficha");
      await cache.getOrLoad("sheet|char-1|user-1", loader);

      cache.invalidateCharacter("");
      await cache.getOrLoad("sheet|char-1|user-1", loader);

      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidateParticipant", () => {
    it("derruba o row mutável sem apagar o owner imutável", async () => {
      const participant = jest.fn().mockResolvedValue("row");
      const owner = jest.fn().mockResolvedValue("dono");
      const other = jest.fn().mockResolvedValue("outro");

      await cache.getOrLoad("participant|part-1", participant);
      await cache.getOrLoad("owner|part-1|user-1", owner);
      await cache.getOrLoad("owner|part-2|user-1", other);

      cache.invalidateParticipant("part-1");

      await cache.getOrLoad("participant|part-1", participant);
      await cache.getOrLoad("owner|part-1|user-1", owner);
      await cache.getOrLoad("owner|part-2|user-1", other);

      expect(participant).toHaveBeenCalledTimes(2);
      expect(owner).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(1);
    });

    it("permite invalidar owner explicitamente quando a identidade muda", async () => {
      const owner = jest.fn().mockResolvedValue("dono");
      await cache.getOrLoad("owner|part-1|user-1", owner);

      cache.invalidateParticipantOwner("part-1");

      await cache.getOrLoad("owner|part-1|user-1", owner);
      expect(owner).toHaveBeenCalledTimes(2);
    });
  });

  describe("invalidatePrefix", () => {
    it("derruba apenas as chaves que começam com o prefixo", async () => {
      const sheet = jest.fn().mockResolvedValue("ficha");
      const actions = jest.fn().mockResolvedValue("acoes");

      await cache.getOrLoad("sheet|char-1|user-1", sheet);
      await cache.getOrLoad("actions|char-1|user-1", actions);

      cache.invalidatePrefix("sheet|");

      await cache.getOrLoad("sheet|char-1|user-1", sheet);
      await cache.getOrLoad("actions|char-1|user-1", actions);

      expect(sheet).toHaveBeenCalledTimes(2);
      expect(actions).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("derruba todo o memo da request corrente", async () => {
      const sheet = jest.fn().mockResolvedValue("ficha");
      const actions = jest.fn().mockResolvedValue("acoes");

      await cache.getOrLoad("sheet|char-1|user-1", sheet);
      await cache.getOrLoad("actions|char-1|user-1", actions);

      cache.clear();

      await cache.getOrLoad("sheet|char-1|user-1", sheet);
      await cache.getOrLoad("actions|char-1|user-1", actions);

      expect(sheet).toHaveBeenCalledTimes(2);
      expect(actions).toHaveBeenCalledTimes(2);
    });
  });
});
