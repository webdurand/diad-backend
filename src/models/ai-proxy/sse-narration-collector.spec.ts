import { SseNarrationCollector } from "./sse-narration-collector";

describe("SseNarrationCollector", () => {
  it("acumula content de eventos type=text simples", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"text","content":"Olá "}\n\n`);
    c.feed(`data: {"type":"text","content":"mundo"}\n\n`);
    expect(c.finalize()).toBe("Olá mundo");
  });

  it("aceita variações narration_token/token/text além de content", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"narration_token","token":"A "}\n\n`);
    c.feed(`data: {"type":"text","text":"taverna "}\n\n`);
    c.feed(`data: {"type":"narration","content":"cheira mal."}\n\n`);
    expect(c.finalize()).toBe("A taverna cheira mal.");
  });

  it("ignora eventos não-narrativos (status, done, error, sources, dice_roll)", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"status","content":"O Mestre prepara..."}\n\n`);
    c.feed(`data: {"type":"text","content":"Cena"}\n\n`);
    c.feed(`data: {"type":"dice_roll","content":"d20=15"}\n\n`);
    c.feed(`data: {"type":"sources","data":[]}\n\n`);
    c.feed(`data: {"type":"done"}\n\n`);
    expect(c.finalize()).toBe("Cena");
  });

  it("lida com chunk parcial (split mid-event)", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"text","cont`);
    c.feed(`ent":"Olá "}\n\ndata: {"type":"text","content":"mundo"}`);
    c.feed(`\n\n`);
    expect(c.finalize()).toBe("Olá mundo");
  });

  it("aceita múltiplos eventos em um único chunk", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"text","content":"A "}\n\ndata: {"type":"text","content":"B "}\n\ndata: {"type":"text","content":"C"}\n\n`,
    );
    expect(c.finalize()).toBe("A B C");
  });

  it("flush no finalize processa linha sem newline final", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"text","content":"A"}\n`);
    c.feed(`data: {"type":"text","content":"B"}`);
    expect(c.finalize()).toBe("AB");
  });

  it("ignora JSON malformado sem quebrar o stream", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {invalid json\n\n`);
    c.feed(`data: {"type":"text","content":"válido"}\n\n`);
    c.feed(`data: \n\n`);
    expect(c.finalize()).toBe("válido");
  });

  it("ignora linhas sem prefixo data:", () => {
    const c = new SseNarrationCollector();
    c.feed(`event: heartbeat\n`);
    c.feed(`: comentário\n`);
    c.feed(`data: {"type":"text","content":"pega"}\n\n`);
    expect(c.finalize()).toBe("pega");
  });

  it("aceita Buffer em feed (não só string)", () => {
    const c = new SseNarrationCollector();
    c.feed(Buffer.from(`data: {"type":"text","content":"Olá"}\n\n`, "utf8"));
    expect(c.finalize()).toBe("Olá");
  });

  it("retorna string vazia quando nenhum evento de narração foi visto", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"status","content":"loading"}\n\n`);
    c.feed(`data: {"type":"done"}\n\n`);
    expect(c.finalize()).toBe("");
  });

  it("tolera CRLF (\\r\\n) usado por alguns proxies SSE", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"text","content":"OK"}\r\n\r\n`);
    expect(c.finalize()).toBe("OK");
  });
});
