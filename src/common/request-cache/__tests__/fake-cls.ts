import type { ClsService } from "nestjs-cls";
import { RequestCache } from "../request-cache.service";

/**
 * Store CLS de mentira para testes: o memo por request só liga quando
 * `isActive()` é true, então qualquer spec que queira exercitar o memo precisa
 * simular um contexto ativo. Vive aqui (e não em `shared/test-utils`) para
 * ficar junto do primitivo que ele fabrica.
 */
export class FakeClsService {
  readonly values = new Map<string, unknown>();

  constructor(public active = true) {}

  isActive(): boolean {
    return this.active;
  }

  get<T>(key: string): T {
    return this.values.get(key) as T;
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

export const asClsService = (fake: FakeClsService): ClsService =>
  fake as unknown as ClsService;

/** `RequestCache` real sobre um contexto CLS ativo de mentira. */
export function createActiveRequestCache(): {
  cache: RequestCache;
  cls: FakeClsService;
} {
  const cls = new FakeClsService(true);
  return { cache: new RequestCache(asClsService(cls)), cls };
}
