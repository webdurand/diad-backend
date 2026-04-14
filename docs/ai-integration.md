# AI Integration — Como trocar o executor de IA

**Source**: spec 003 T073 + ADR 0004

O backend delega decisões de turno de IA ao `AiTurnExecutor` (abstract class NestJS). Duas implementações vivem hoje:

| Implementação | Arquivo | Uso |
|---|---|---|
| `RemoteAgentExecutor` | `src/models/game-engine/services/remote-agent.executor.ts` | Default em dev/prod — chama `diad-agents` via HTTP |
| `MockAiTurnExecutor` | `src/models/game-engine/services/mock-ai-turn.executor.ts` | Tests (`NODE_ENV=test`) — decisões determinísticas |

## Binding

`src/models/game-engine/game-engine.module.ts` faz o provider condicional:

```ts
{
  provide: AiTurnExecutor,
  useClass: process.env.NODE_ENV === 'test' ? MockAiTurnExecutor : RemoteAgentExecutor,
}
```

`AiTurnService` injeta `AiTurnExecutor` (abstract) e nunca conhece HTTP nem `AiProxyService` diretamente (DIP).

## Para adicionar uma nova implementação

1. Crie uma classe em `services/` que estende `AiTurnExecutor`:

   ```ts
   @Injectable()
   export class MyExecutor extends AiTurnExecutor {
     async executeTurn(snapshot, participantId, opts) {
       // …
     }
   }
   ```

2. Registre no módulo:

   ```ts
   providers: [
     MyExecutor,
     { provide: AiTurnExecutor, useClass: MyExecutor },
   ]
   ```

3. Opcional: selecione por env var/config ao invés de `NODE_ENV` — basta trocar a condição do `useClass`.

## Contrato

A interface está em [`services/ai-turn-executor.interface.ts`](../src/models/game-engine/services/ai-turn-executor.interface.ts). O retorno é um `TurnExecutionPlan` com:

- `steps: PlannedActionStep[]` — sequência determinística pra aplicar
- `rationale?: string` — texto opcional pra auditoria
- `llmCostUsd?: number` — observabilidade de custo
- `tookMs: number` — latência do executor

## Timeout

`RemoteAgentExecutor` respeita `AI_TURN_TIMEOUT_MS` do env (default 30000ms). Timeout → retorna `GameErrorCode.AI_TIMEOUT` → `AiTurnService` aplica fallback (`end-turn` implícito + evento `ai_timeout`).

## Testes

`MockAiTurnExecutor` é usado automaticamente em `NODE_ENV=test`. Para forçar em outro contexto:

```ts
Test.createTestingModule({...})
  .overrideProvider(AiTurnExecutor)
  .useClass(MockAiTurnExecutor)
```

## Ver também

- ADR 0004 — decisão de introduzir a interface
- Contrato HTTP `diad-agents /monsters/decide` → `specs/003-encounter-parity-and-ai-hooks/contracts/agents-decide-monster.http.md`
- Spec 003 quickstart — cenário E2E de validação
