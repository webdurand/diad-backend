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

  // ════════════════════════════════════════════
  // dice_roll capture (request + resolved + preflight)
  // Garante que skill checks sobrevivem ao reload.
  // ════════════════════════════════════════════

  it("captura dice_roll_request + dice_roll_resolved fundindo num único roll", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"dice_roll_request","rollId":"r1","kind":"ability_check","ability":"WIS","skill":"Perception","dc":12,"modifiers":[{"label":"WIS mod","value":3}],"totalModifier":3,"targetD20":9,"advantage":"normal"}\n\n`,
    );
    c.feed(
      `data: {"type":"dice_roll_resolved","rollId":"r1","rawD20":7,"total":10,"verdict":"failure"}\n\n`,
    );
    c.finalize();
    const rolls = c.getDiceRolls();
    expect(rolls).toHaveLength(1);
    expect(rolls[0].rollId).toBe("r1");
    expect(rolls[0].skill).toBe("Perception");
    expect(rolls[0].dc).toBe(12);
    expect(rolls[0].resolved).toEqual({
      rawD20: 7,
      rawD20Disadv: null,
      total: 10,
      verdict: "failure",
    });
  });

  it("omite roll que ficou só com request (sem resolved) — não polui timeline", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"dice_roll_request","rollId":"orphan","kind":"ability_check","ability":"DEX","skill":"Stealth","dc":15,"modifiers":[],"totalModifier":0,"targetD20":15}\n\n`,
    );
    c.finalize();
    expect(c.getDiceRolls()).toHaveLength(0);
  });

  it("ignora dice_roll_resolved sem request prévio (rollId desconhecido)", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"dice_roll_resolved","rollId":"ghost","rawD20":15,"total":20,"verdict":"success"}\n\n`,
    );
    c.finalize();
    expect(c.getDiceRolls()).toHaveLength(0);
  });

  it("preserva rawD20Disadv em rolls com vantagem/desvantagem", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"dice_roll_request","rollId":"r2","kind":"saving_throw","ability":"CON","skill":null,"dc":13,"modifiers":[{"label":"CON","value":2}],"totalModifier":2,"targetD20":11,"advantage":"advantage"}\n\n`,
    );
    c.feed(
      `data: {"type":"dice_roll_resolved","rollId":"r2","rawD20":18,"rawD20Disadv":4,"total":20,"verdict":"success"}\n\n`,
    );
    c.finalize();
    const rolls = c.getDiceRolls();
    expect(rolls[0].advantage).toBe("advantage");
    expect(rolls[0].resolved?.rawD20Disadv).toBe(4);
  });

  it("expande preflight_rolls (request + resolved fundidos) em rolls completos", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"preflight_rolls","rolls":[` +
        `{"ability":"WIS","skill":"Insight","kind":"skill_check","dc":13,"rawD20":18,"modifier":2,"total":20,"success":true},` +
        `{"ability":"INT","skill":"Investigation","kind":"skill_check","dc":15,"rawD20":1,"modifier":4,"total":5,"success":false}` +
        `]}\n\n`,
    );
    c.finalize();
    const rolls = c.getDiceRolls();
    expect(rolls).toHaveLength(2);
    expect(rolls[0].skill).toBe("Insight");
    expect(rolls[0].resolved?.verdict).toBe("success");
    // nat 1 vira crit_failure mesmo que success=false
    expect(rolls[1].skill).toBe("Investigation");
    expect(rolls[1].resolved?.verdict).toBe("crit_failure");
    expect(rolls[1].resolved?.rawD20).toBe(1);
  });

  it("preflight nat 20 sempre vira crit_success mesmo com success=false do upstream", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"preflight_rolls","rolls":[{"ability":"STR","skill":"Athletics","kind":"skill_check","dc":30,"rawD20":20,"modifier":3,"total":23,"success":false}]}\n\n`,
    );
    c.finalize();
    expect(c.getDiceRolls()[0].resolved?.verdict).toBe("crit_success");
  });

  it("ignora dice_roll_request sem rollId", () => {
    const c = new SseNarrationCollector();
    c.feed(
      `data: {"type":"dice_roll_request","kind":"ability_check","dc":12}\n\n`,
    );
    c.finalize();
    expect(c.getDiceRolls()).toHaveLength(0);
  });

  it("dice_roll capture coexiste com narração no mesmo stream", () => {
    const c = new SseNarrationCollector();
    c.feed(`data: {"type":"text","content":"Você procura."}\n\n`);
    c.feed(
      `data: {"type":"dice_roll_request","rollId":"r3","kind":"ability_check","ability":"WIS","skill":"Perception","dc":14,"modifiers":[],"totalModifier":1,"targetD20":13}\n\n`,
    );
    c.feed(
      `data: {"type":"dice_roll_resolved","rollId":"r3","rawD20":9,"total":10,"verdict":"failure"}\n\n`,
    );
    c.feed(`data: {"type":"text","content":" Nada."}\n\n`);
    expect(c.finalize()).toBe("Você procura. Nada.");
    expect(c.getDiceRolls()).toHaveLength(1);
  });
});
