import { EventEmitter } from "events";
import { AiProxyService } from "./ai-proxy.service";

// Mock estável do `http` Node nativo. O serviço usa `http.request(...)`
// e nós substituímos por uma factory controlada pelos testes.
const mockHttpRequestFn: jest.Mock = jest.fn();
jest.mock("http", () => ({
  request: (...args: unknown[]) => mockHttpRequestFn(...args),
}));

/**
 * Spec 014 (M2/M3) — AI proxy SSE passthrough.
 *
 * Garante que `pipeStream` encaminha 100% dos chunks SSE recebidos do
 * serviço de agents (Python/FastAPI) para o response do client SEM
 * parsear, filtrar ou whitelist-ar por event type.
 *
 * Eventos novos como `state_delta`, `dice_roll_request` e
 * `dice_roll_resolved` (Spec 014) DEVEM atravessar sem qualquer
 * intervenção do backend NestJS.
 */
describe("AiProxyService.pipeStream — SSE passthrough", () => {
  function makeConfig(): any {
    return { get: () => "http://localhost:9003" };
  }

  function makeOutbound(): any {
    return { request: jest.fn() };
  }

  function makeLogger(): any {
    return {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  }

  function makeCls(): any {
    return {
      isActive: () => true,
      get: () => "a".repeat(32),
    };
  }

  function makeFakeRes() {
    const writes: Buffer[] = [];
    let ended = false;
    const closeListeners: Array<() => void> = [];
    const res: any = {
      write: jest.fn((chunk: any) => {
        writes.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
        return true;
      }),
      end: jest.fn(() => {
        ended = true;
      }),
      flush: jest.fn(),
      // C1 — pipeStream registra `res.on('close', ...)` pra detectar
      // client disconnect mid-stream. Mock simples só armazena.
      on: jest.fn((event: string, cb: () => void) => {
        if (event === "close") closeListeners.push(cb);
        return res;
      }),
    };
    return {
      res,
      writes,
      isEnded: () => ended,
      joinedOutput: () => Buffer.concat(writes).toString("utf-8"),
      simulateClose: () => closeListeners.forEach((cb) => cb()),
    };
  }

  /**
   * Cria um fake `http.request` que entrega `chunks` em sequência via
   * o callback `(proxyRes) => …` e finaliza o stream.
   */
  function mockHttpRequest(opts: { statusCode?: number; chunks: string[] }) {
    const proxyRes: any = new EventEmitter();
    proxyRes.statusCode = opts.statusCode ?? 200;

    const clientReq: any = new EventEmitter();
    clientReq.write = jest.fn();
    clientReq.end = jest.fn();

    mockHttpRequestFn.mockImplementation((_options: any, cb?: any): any => {
      // Chama o callback no próximo tick, depois emite chunks/end.
      setImmediate(() => {
        cb(proxyRes);
        for (const c of opts.chunks) {
          proxyRes.emit("data", Buffer.from(c, "utf-8"));
        }
        proxyRes.emit("end");
      });
      return clientReq;
    });

    return { clientReq };
  }

  afterEach(() => {
    mockHttpRequestFn.mockReset();
  });

  it("encaminha cada chunk SSE idêntico — incluindo state_delta e dice_roll_*", async () => {
    const stateDeltaChunk =
      'data: {"type":"state_delta","characterId":"x","deltas":{"hpCurrent":5}}\n\n';
    const diceRequestChunk =
      'data: {"type":"dice_roll_request","rollId":"r1"}\n\n';
    const diceResolvedChunk =
      'data: {"type":"dice_roll_resolved","rollId":"r1","result":17}\n\n';
    const narrativeChunk =
      'data: {"type":"narrative","content":"You see a goblin."}\n\n';

    mockHttpRequest({
      chunks: [
        stateDeltaChunk,
        diceRequestChunk,
        diceResolvedChunk,
        narrativeChunk,
      ],
    });

    const svc = new AiProxyService(
      makeConfig(),
      makeOutbound(),
      makeLogger(),
      makeCls(),
    );
    const fake = makeFakeRes();

    await svc.pipeStream("/solo/abc/message", { message: "hi" }, fake.res);

    // Cada chunk vira EXATAMENTE uma chamada a res.write — sem merge, sem split.
    expect(fake.res.write).toHaveBeenCalledTimes(4);

    const output = fake.joinedOutput();
    expect(output).toContain(stateDeltaChunk);
    expect(output).toContain(diceRequestChunk);
    expect(output).toContain(diceResolvedChunk);
    expect(output).toContain(narrativeChunk);

    // Ordem preservada.
    const idxState = output.indexOf(stateDeltaChunk);
    const idxReq = output.indexOf(diceRequestChunk);
    const idxResolved = output.indexOf(diceResolvedChunk);
    const idxNarr = output.indexOf(narrativeChunk);
    expect(idxState).toBeLessThan(idxReq);
    expect(idxReq).toBeLessThan(idxResolved);
    expect(idxResolved).toBeLessThan(idxNarr);

    expect(fake.isEnded()).toBe(true);
  });

  it("não muta payload de tipos desconhecidos — proxy é totalmente cego", async () => {
    const customChunk =
      'data: {"type":"future_unknown_event_type_xyz","payload":{"foo":"bar","n":42}}\n\n';

    mockHttpRequest({ chunks: [customChunk] });

    const svc = new AiProxyService(
      makeConfig(),
      makeOutbound(),
      makeLogger(),
      makeCls(),
    );
    const fake = makeFakeRes();

    await svc.pipeStream("/solo/abc/message", { message: "hi" }, fake.res);

    expect(fake.res.write).toHaveBeenCalledTimes(1);
    expect(fake.joinedOutput()).toBe(customChunk);
  });

  it("em statusCode != 200, emite chunk de erro e encerra", async () => {
    mockHttpRequest({
      statusCode: 500,
      chunks: ["internal agent failure"],
    });

    const svc = new AiProxyService(
      makeConfig(),
      makeOutbound(),
      makeLogger(),
      makeCls(),
    );
    const fake = makeFakeRes();

    await svc.pipeStream("/solo/abc/message", { message: "hi" }, fake.res);

    const out = fake.joinedOutput();
    expect(out).toContain('"type":"error"');
    expect(out).toContain("internal agent failure");
    expect(fake.isEnded()).toBe(true);
  });
});
