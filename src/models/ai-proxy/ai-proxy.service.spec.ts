import { EventEmitter } from "events";
import { AiProxyService } from "./ai-proxy.service";



const mockHttpRequestFn: jest.Mock = jest.fn();
jest.mock("http", () => ({
  request: (...args: unknown[]) => mockHttpRequestFn(...args),
}));


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
    const writeOrder: string[] = [];
    let ended = false;
    const closeListeners: Array<() => void> = [];
    const res: any = {
      write: jest.fn((chunk: any) => {
        writeOrder.push(Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk));
        writes.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
        return true;
      }),
      end: jest.fn(() => {
        writeOrder.push("end");
        ended = true;
      }),
      flush: jest.fn(),


      on: jest.fn((event: string, cb: () => void) => {
        if (event === "close") closeListeners.push(cb);
        return res;
      }),
      off: jest.fn((event: string, cb: () => void) => {
        if (event === "close") {
          const index = closeListeners.indexOf(cb);
          if (index >= 0) closeListeners.splice(index, 1);
        }
        return res;
      }),
    };
    return {
      res,
      writes,
      writeOrder,
      isEnded: () => ended,
      joinedOutput: () => Buffer.concat(writes).toString("utf-8"),
      simulateClose: () => closeListeners.forEach((cb) => cb()),
    };
  }


  function mockHttpRequest(opts: { statusCode?: number; chunks: string[] }) {
    const proxyRes: any = new EventEmitter();
    proxyRes.statusCode = opts.statusCode ?? 200;

    const clientReq: any = new EventEmitter();
    clientReq.write = jest.fn();
    clientReq.end = jest.fn();

    mockHttpRequestFn.mockImplementation((_options: any, cb?: any): any => {

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


    expect(fake.res.write).toHaveBeenCalledTimes(4);

    const output = fake.joinedOutput();
    expect(output).toContain(stateDeltaChunk);
    expect(output).toContain(diceRequestChunk);
    expect(output).toContain(diceResolvedChunk);
    expect(output).toContain(narrativeChunk);


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

  it("escreve cada chunk upstream antes de encerrar o response", async () => {
    const firstChunk = 'data: {"type":"status","content":"um"}\n\n';
    const secondChunk = 'data: {"type":"narrator","content":"dois"}\n\n';

    mockHttpRequest({ chunks: [firstChunk, secondChunk] });

    const svc = new AiProxyService(
      makeConfig(),
      makeOutbound(),
      makeLogger(),
      makeCls(),
    );
    const fake = makeFakeRes();

    await svc.pipeStream("/solo/abc/message", { message: "hi" }, fake.res);

    expect(fake.writeOrder).toEqual([firstChunk, secondChunk, "end"]);
    expect(fake.res.flush).toHaveBeenCalledTimes(2);
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
