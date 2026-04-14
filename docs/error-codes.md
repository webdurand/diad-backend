# Game Engine Error Codes

Todos os endpoints `/game/encounters/...` retornam envelope padronizado em caso de falha:

```json
{ "ok": false, "error": "<mensagem PT-BR>", "code": "<CODE_CONSTANT>" }
```

Os códigos canônicos estão em [`src/models/game-engine/interfaces/result.type.ts`](../src/models/game-engine/interfaces/result.type.ts) (enum `GameErrorCode`).

Referência completa, incluindo descrição semântica de cada código e HTTP status associado:
- Base: [`diad-meta/specs/002-encounter-correctness/contracts/error-codes-catalog.md`](../../diad-meta/specs/002-encounter-correctness/contracts/error-codes-catalog.md)
- Adições spec 003 (IA + ações genéricas): `NOT_AI_CONTROLLED`, `AI_UNAVAILABLE`, `AI_TIMEOUT`, `NOT_DODGING`, `NOT_HIDDEN`, `INVALID_READY_TRIGGER`, `ITEM_NOT_USABLE`, `CONTROL_CHANGE_FORBIDDEN` — ver [`diad-meta/specs/003-encounter-parity-and-ai-hooks/data-model.md`](../../diad-meta/specs/003-encounter-parity-and-ai-hooks/data-model.md#gameerrorcode-enum-existente--adições).

## Regras

1. Services usam `failure(ERROR_MESSAGES_PT_BR[GameErrorCode.X], GameErrorCode.X)` — nunca string literal.
2. ValidationPipe global converte payloads inválidos para `{code:'INVALID_PAYLOAD'}` automaticamente.
3. `GameErrorFilter` global converte `NotFoundException`/`ForbiddenException`/`UnauthorizedException` para envelope.
4. Testes asseguram em `code` (estável), não em `error` (mensagem pode evoluir).
