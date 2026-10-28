# Implementation Plan: Paridade com o Meu Assessor (US1 a US8)

**Branch**: `001-us8-open-finance` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1), US2 (documentos, PR #2),
US3 (avisos proativos, PR #3), US4 (Google Agenda, PR #4), US5 (pagina de agendamento, PR #5), US6
(mensagens a outras pessoas, PR #6) e US7 (area do contador, PR #7) estao implementadas e na
`main`. Esta revisao planeja a US8 (Open Finance so leitura). A US9 entra depois.

## Summary

**US1 a US7, entregues**: conta compartilhada (R1 a R10), documentos (R11 a R22), avisos
proativos (R23 a R34), Google Agenda (R35 a R46), pagina de agendamento (R47 a R58), mensagens a
outras pessoas (R59 a R70) e area do contador (R71 a R80).

**US8, este plano**: o titular conecta bancos e cartoes pelo Pluggy Connect, no painel. O servidor
le contas, cartoes, faturas e movimentacoes pela API REST do parceiro, so leitura, e transforma cada
movimentacao confirmada num lancamento com categoria, contraparte e forma de pagamento, unindo com o
lancamento manual equivalente (mesmo valor, data a ate 2 dias) em vez de duplicar. A primeira
importacao traz 90 dias; depois o webhook do parceiro (que so dispara uma busca) e o agendador a
cada 6 horas mantem tudo em dia. Estorno tira do total. Consentimento perto de vencer, com erro ou
revogado para a importacao e avisa o titular. O assessor responde sobre a fatura do cartao e recusa
qualquer pedido de movimentar dinheiro. Detalhes em [research.md](research.md) R81 a R92.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13; API REST da Pluggy (sem SDK no
servidor); no painel, `pluggy-connect-sdk` para abrir o widget de consentimento (dependencia nova,
justificada em R84)

**Storage**: SQLite: `bank_connections`, `bank_accounts`, `card_bills`; colunas `source`,
`external_id`, `bank_account_id` e `reversed_at` em `transactions`; tipo de aviso `bancos`

**Testing**: `node --test` via `npm test`, com `test/bancos.test.ts` e o parceiro simulado em
`test/pluggyFalso.ts`; `npm run typecheck`; `vue-tsc` no painel

**Target Platform**: servidor Node unico

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: primeira importacao de 90 dias em menos de 1 minuto por conta; webhook
responde `202` na hora e sincroniza fora do pedido

**Constraints**: so leitura (FR-032, FR-035); sem duplicar (FR-033, SC-009 abaixo de 2%); avisar
consentimento (FR-034); corpo do webhook nunca vira dado (R85); custo do parceiro a confirmar
(R92)

**Scale/Scope**: 5 rotas privadas e 1 publica, 2 ferramentas, 1 tipo de aviso, tela Financas >
Bancos, selo "banco" nas transacoes, tarefa nova no agendador

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US8) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Conexao por conta, so o titular conecta; item conferido pelo `clientUserId`; credenciais do banco nunca passam pelo servidor; webhook so dispara busca do item conhecido; perfis continuam filtrando o que cada membro ve | Passa |
| II. Dinheiro so leitura | So rotas de leitura do parceiro; nenhuma iniciacao de pagamento; assessor recusa Pix e transferencia (R82) | Passa |
| III. Provedor de IA intercambiavel | Ferramentas comuns aos dois provedores | Passa |
| IV. Custo por conta sob controle | Importacao e categorizacao sem IA; custo do parceiro por conexao a confirmar no contrato antes de abrir a todos (R92) | Passa, com a condicao de R92 |
| V. Uma fonte de verdade | Movimentacoes viram lancamentos comuns, com categoria e contraparte na entrada, vistos igual no WhatsApp e no painel | Passa |
| VI. Simplicidade de MVP | REST direto no servidor; uma dependencia so no painel, obrigatoria para o consentimento (R84); codigo do parceiro isolado em um arquivo | Passa |
| VII. Honestidade | Sem credenciais, "nao disponivel"; erro de consentimento visivel e avisado; estorno marcado | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US7 entregues, US8 planejada
├── research.md          # R1 a R80 (US1 a US7), R81 a R92 (US8)
├── data-model.md        # secoes US1 a US8
├── quickstart.md        # secoes US1 a US8
├── contracts/           # US1 a US7, mais api-bancos.md e ferramentas-bancos.md (US8)
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US7 concluidas; US8 entra via /speckit-tasks
```

### Source Code (repository root), US8

```text
src/
├── openfinance.ts   # novo: cliente REST do parceiro (auth, connect token, itens, contas, faturas, transacoes)
├── bancos.ts        # novo: tabelas, conexoes, sincronizacao, mapa de categorias, uniao com manuais, estorno, fatura, avisos
├── db.ts            # colunas novas em transactions; estornadas fora das consultas
├── avisos.ts        # tipo de aviso bancos
├── scheduler.ts     # sincronizacao a cada 6 h e aviso de consentimento
├── tools.ts         # bancos_conectados, fatura_do_cartao; [banco] em consultar_transacoes
├── prompt.ts        # regras de fatura e de so leitura
├── config.ts        # PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, OPENFINANCE_WEBHOOK_SECRET
└── api.ts           # rotas /api/bancos e webhook publico

web/src/
├── views/financas/BancosView.vue   # novo: conectar, renovar, sincronizar, desconectar, contas e cartoes
├── views/financas/TransacoesView.vue  # selo banco e estornada
├── mesas.ts, router.ts             # Bancos no submenu de Financas
└── api.ts                          # tipos

test/
├── pluggyFalso.ts
└── bancos.test.ts
```

**Structure Decision**: `src/openfinance.ts` fala com o parceiro e mais nada; `src/bancos.ts` tem a
regra de negocio e nao conhece URL nem formato do parceiro alem dos tipos que o cliente devolve.
Trocar de parceiro e reescrever so o primeiro.

## Ordem sugerida (US8)

1. Tabelas, colunas e cliente do parceiro, com o simulado.
2. Sincronizacao: contas, faturas, movimentacoes, categoria, contraparte, uniao, estorno.
3. Rotas, webhook e agendador.
4. Avisos de consentimento.
5. Ferramentas e prompt.
6. Painel: Bancos e selo nas transacoes.
7. README, `.env.example` e quickstart com o sandbox.

## Fora desta entrega (US8)

- Importar extrato OFX ou CSV.
- Saldo consolidado e previsao de caixa com dados do banco.
- Investimentos e emprestimos do Open Finance.
- Qualquer movimentacao de dinheiro (proibida pela constituicao).

## Complexity Tracking

Sem violacoes da constituicao.
