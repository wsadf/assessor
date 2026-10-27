# Implementation Plan: Paridade com o Meu Assessor (US1 a US3)

**Branch**: `001-us3-avisos` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1) e US2 (documentos, PR #2)
estao implementadas e na `main`. Esta revisao planeja a US3 (avisos proativos de financas). As
historias 4 a 9 entram depois.

## Summary

**US1, entregue**: conta compartilhada por convite, com perfis fixos e permissao aplicada nas
ferramentas, nas rotas e numa visao do repo por perfil. Decisoes R1 a R10.

**US2, entregue**: guarda e busca de documentos pelo WhatsApp e pelo painel, com arquivos no disco
e busca FTS5. Decisoes R11 a R22.

**US3, este plano**: o assessor passa a avisar sem esperar pergunta. Contas a pagar avisam na
vespera e viram despesa com "paguei"; lancamentos recorrentes entram sozinhos; categoria que
gasta 15% acima do mes anterior gera aviso com a projecao do mes; resumo da noite opcional;
comparativo com o mes anterior sob pedido. Todo aviso e montado por codigo, sem IA, com
preferencia por pessoa e sem repeticao. Aviso que a Meta recusa fica guardado e sai na proxima
conversa, o que tambem corrige o reenvio infinito de lembretes que falham hoje. Detalhes em
[research.md](research.md) R23 a R34.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13, SDK da Anthropic; Gemini via REST;
painel em Vue 3 + Vue Router + Vite. Nenhuma dependencia nova.

**Storage**: SQLite: `bills`, `recurring`, `notice_prefs`, `notice_log`, `pending_notices`;
colunas `recurring_id` e `bill_id` em `transactions`

**Testing**: `node --test` via `npm test`, com `test/avisos.test.ts`; `npm run typecheck`;
`vue-tsc` no painel

**Target Platform**: servidor Node unico, agendador no mesmo processo (tick de 30 s)

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: um tick do agendador em menos de 200 ms para mil contas; SC-004 (95% dos
avisos de vencimento na vespera, no horario, e nenhum duplicado)

**Constraints**: avisos sem chamada de IA; janela de 24 horas do WhatsApp (modelo aprovado ou
fila de pendentes); horario local de `TIMEZONE`

**Scale/Scope**: 9 ferramentas novas, 3 grupos de rotas, 2 telas novas, um modulo de avisos e
mudancas no agendador e no webhook

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US3) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Contas, recorrencias e avisos filtrados pela conta e pelo perfil (R32); aviso so vai para quem pode ver a area; preferencias por pessoa | Passa |
| II. Dinheiro so leitura | "Pagar" uma conta so registra a despesa que a pessoa ja pagou; nada movimenta dinheiro | Passa |
| III. Provedor de IA intercambiavel | Ferramentas em `src/tools.ts`; avisos nao dependem de provedor | Passa |
| IV. Custo por conta sob controle | Avisos sem IA (R23); ferramentas no bloco com cache (R34) | Passa |
| V. Uma fonte de verdade | WhatsApp, terminal, painel e agendador usam o mesmo modulo `src/avisos.ts` e o mesmo repo | Passa |
| VI. Simplicidade de MVP | Agendador existente, SQLite, sem fila externa nem dependencia | Passa |
| VII. Honestidade | Numeros dos avisos vem do banco; a tela de Avisos diz quando os avisos dependem da janela de 24 horas; resumo vazio nao e enviado | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 e US2 entregues, US3 planejada
├── research.md          # R1 a R10 (US1), R11 a R22 (US2), R23 a R34 (US3)
├── data-model.md        # secoes US1, US2 e US3
├── quickstart.md        # secoes US1, US2 e US3
├── contracts/
│   ├── api-conta.md, ferramentas-agente.md          # US1
│   ├── api-documentos.md, ferramentas-documentos.md # US2
│   └── api-avisos.md, ferramentas-avisos.md         # US3
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 e US2 concluidas; US3 entra via /speckit-tasks
```

### Source Code (repository root), US3

```text
src/
├── avisos.ts        # novo: tabelas, contas a pagar, recorrencias, preferencias, log, pendentes, calculo de categoria, comparativo, textos dos avisos
├── db.ts            # colunas recurring_id e bill_id; chama prepararTabelasAvisos
├── scheduler.ts     # roda vencimentos, recorrencias, categoria e resumos por pessoa; envio com fila de pendentes; lembrete que falha nao repete
├── server.ts        # entrega os pendentes antes da resposta
├── tools.ts         # 9 ferramentas novas
├── prompt.ts        # regras de pagar, recorrencia e configurar avisos
├── api.ts           # /contas-pagar, /recorrencias, /avisos; recorrente e contaPagarId em /transacoes; contasProximas em /financas
└── seed.ts          # contas a pagar e recorrencias de exemplo

web/src/
├── views/financas/ContasView.vue   # novo: contas a pagar e recorrencias
├── views/operacao/AvisosView.vue   # novo: preferencias de aviso
├── views/financas/FinancasPainel.vue  # bloco "Vence nos proximos dias"
├── views/OperacaoMesa.vue          # atalho Avisos
├── mesas.ts, router.ts             # submenu e rotas
└── api.ts                          # tipos

test/
└── avisos.test.ts   # incluido no script test
```

**Structure Decision**: mesmo layout das historias anteriores. `src/avisos.ts` segue o estilo de
`conta.ts` e `documentos.ts`. O agendador continua um so arquivo, chamando funcoes puras de
`avisos.ts` que recebem `now`, o que deixa os testes sem espera de relogio.

## Ordem sugerida (US3)

1. `avisos.ts`: tabelas, preferencias, log e pendentes, com testes.
2. Contas a pagar e recorrencias no dominio, com testes de datas.
3. Calculo de categoria, comparativo e resumo da noite.
4. Agendador com fila de pendentes; webhook entrega pendentes.
5. Ferramentas e prompt.
6. API.
7. Painel: Contas e recorrencias, Avisos, bloco no painel de Financas.
8. Seed, README, quickstart.

## Fora desta entrega (US3)

- Fatura lida do banco (US8, Open Finance).
- Aviso por e-mail ou push; so WhatsApp.
- Alertas configuraveis por valor ("me avisa se passar de R$ 500 em mercado").

## Complexity Tracking

Sem violacoes da constituicao.
