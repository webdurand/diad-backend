# PROBE-015-* — Spec 015 Combat Polish Foundations

Scripts HTTP que validam os acceptance criteria da Spec 015 contra um backend
rodando (porta default 9001). Ancoraram a validação em tela durante o
desenvolvimento; servem de regressão rápida + documentação executável.

## Pré-requisitos

- Backend rodando em `http://localhost:9001` (override via `DIAD_BACKEND_URL`).
- PCs de teste seedados: `druid-L20-<timestamp>`, `bard-L20-<timestamp>`, `wizard-L20-<timestamp>`.
- Credenciais: `admin@diad.com / Trabalh0!` (override via `DIAD_EMAIL` / `DIAD_PASSWORD`).

## Probes

| ID | Eixo | O que valida |
|----|------|-------------|
| `PROBE-015-FEATURE-01` | 1 | `GET /sheet` features enriquecidas (Archdruid/Timeless Body capstone, BI variants resource+short, Cutting Words pool) |
| `PROBE-015-SPELL-RANGE-01` | 2 | Produce Flame self reject + 25ft OK + 35ft OUT_OF_RANGE |
| `PROBE-015-CONDITION-01` | 3 | `ConditionInstance.source` populated + `condition_removed` event tem `narrativeDescriptor` + `removalReason` |

## Arquivos `archive-*`

Scripts efêmeros usados durante desenvolvimento (sessão 2026-04-24), versionados
aqui como documentação de setups mais complexos (Eixo 4 Polymorph, Eixo 5
Magic Missile, Overflow damage). Não fazem parte da suíte de regressão.

## Como rodar

```bash
# Single probe
node tests/probes/015/PROBE-015-FEATURE-01-druid-bard-enrichment.mjs

# Todos (sequencial)
node tests/probes/015/run-all.mjs
```

## Saída

Cada probe imprime `✓` / `✗` por assertion e termina com:
```
━━━ Result: N passed, M failed ━━━
```
Exit code 0 se all-green, 1 caso contrário.
