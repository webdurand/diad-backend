import { Injectable, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";

type MemoStore = Map<string, Promise<unknown>>;

/**
 * Memoização com escopo de request, apoiada no store do nestjs-cls que já é
 * montado globalmente (`ObservabilityModule`).
 *
 * Motivação (perf 2026-07-27): um POST /encounters/:id/attack recomputava a
 * MESMA ficha de personagem 6-10x e re-resolvia o MESMO dono de participante
 * 8-12x, cada uma custando dezenas de round-trips para o Neon (~11ms cada).
 * O memo colapsa essas leituras idênticas em uma só.
 *
 * Garantias de segurança:
 * - Fora de um contexto CLS (loops de turno de IA, gateway de socket, jobs de
 *   background) o memo é transparente: o loader roda direto, sem cache.
 * - O tempo de vida máximo é o de UMA request. Nada sobrevive à resposta, então
 *   não existe classe de bug de cache stale entre requests.
 * - Promise rejeitada nunca fica memoizada.
 */
@Injectable()
export class RequestCache {
  private static readonly STORE_KEY = "diad:request-memo";

  constructor(@Optional() private readonly cls?: ClsService) {}

  private store(): MemoStore | null {
    if (!this.cls?.isActive()) return null;
    let store = this.cls.get<MemoStore | undefined>(RequestCache.STORE_KEY);
    if (!store) {
      store = new Map<string, Promise<unknown>>();
      this.cls.set(RequestCache.STORE_KEY, store);
    }
    return store;
  }

  /** Retorna o valor memoizado da request ou executa o loader e memoiza. */
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const store = this.store();
    if (!store) return loader();

    const hit = store.get(key);
    if (hit) return hit as Promise<T>;

    const pending = loader().catch((err: unknown) => {
      store.delete(key);
      throw err;
    });
    store.set(key, pending);
    return pending;
  }

  /** Invalida todas as entradas cujo nome começa com o prefixo. */
  invalidatePrefix(prefix: string): void {
    const store = this.store();
    if (!store) return;
    for (const key of [...store.keys()]) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }

  /**
   * Invalida tudo que deriva de um personagem. Usado quando HP, usos de
   * feature, slots ou estado do personagem mudam no meio do comando.
   */
  invalidateCharacter(characterId: string): void {
    if (!characterId) return;
    const store = this.store();
    if (!store) return;
    const needle = `|${characterId}`;
    for (const key of [...store.keys()]) {
      if (key.includes(needle)) store.delete(key);
    }
  }

  /** Invalida tudo que deriva de um participante do encontro. */
  invalidateParticipant(participantId: string): void {
    if (!participantId) return;
    const store = this.store();
    if (!store) return;
    const needle = `|${participantId}`;
    for (const key of [...store.keys()]) {
      if (key.includes(needle)) store.delete(key);
    }
  }

  /** Somente para testes: derruba o memo da request corrente. */
  clear(): void {
    this.store()?.clear();
  }
}
