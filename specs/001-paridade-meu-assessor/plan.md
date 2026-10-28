# Implementation Plan: Paridade com o Meu Assessor (US1 a US8)

**Branch**: `001-us8-open-finance` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1), US2 (documentos, PR #2),
US3 (avisos proativos, PR #3), US4 (Google Agenda, PR #4), US5 (pagina de agendamento, PR #5), US6
(mensagens a outras pessoas, PR #6) e US7 (area do contador, PR #7) estao implementadas e na
`main`. Esta revisao planeja a US8 sem parceiro de Open Finance (decisao de 2026-10-27, R81): o
extrato OFX entra agora e a conexao automatica fica para quando houver contrato. A US9 entra
depois.

## Summary

**US1 a US7, entregues**: conta compartilhada (R1 a R10), documentos (R11 a R22), avisos
proativos (R23 a R34), Google Agenda (R35 a R46), pagina de agendamento (R47 a R58), mensagens a
outras pessoas (R59 a R70) e area do contador (R71 a R80).

**US8, este plano**: o usuario manda o extrato ou a fatura em OFX, pelo painel ou pelo WhatsApp.
Um leitor proprio (OFX 1.x e 2.x, sem dependencia) identifica a conta ou o cartao e cada
movimentacao, que vira lancamento com categoria (pela historia da contraparte ou por regras),
contraparte limpa e forma de pagamento. O mesmo arquivo nao duplica; um gasto ja registrado pelo
WhatsApp com mesmo valor e data a ate 2 dias e unido; pagamento de fatura e investimento sao
ignorados; credito no cartao estorna a compra correspondente. Com fechamento e vencimento
informados no cartao, o assessor responde sobre a fatura. Nada movimenta dinheiro. Adiados: conexao
por parceiro (FR-032), aviso de consentimento (FR-034) e os cenarios 1 e 4. Detalhes em
[research.md](research.md) R81 a R90.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13; painel em Vue 3 + Vue Router.
Nenhuma dependencia nova.

**Storage**: SQLite: `bank_accounts`, `bank_imports`; colunas `source`, `external_id`,
`bank_account_id` e `reversed_at` em `transactions`

**Testing**: `node --test` via `npm test`, com `test/extratos.test.ts` e arquivos de exemplo em
`test/ofx/`; `npm run typecheck`; `vue-tsc` no painel

**Target Platform**: servidor Node unico

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: extrato de 1.000 movimentacoes importado em menos de 5 s

**Constraints**: sem duplicar (FR-033, SC-009 abaixo de 2%); so leitura (FR-035); arquivo nao fica
no servidor; numero completo da conta nao e guardado (R84, R90)

**Scale/Scope**: 4 rotas, 3 ferramentas, `src/ofx.ts` e `src/extratos.ts`, tela Financas >
Extratos, selo "extrato" nas transacoes, estornadas fora dos totais

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US8) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Contas e lancamentos por conta; so a chave da conta bancaria (hash) e 4 digitos; arquivo descartado; perfil so gastos nao importa nem ve receitas | Passa |
| II. Dinheiro so leitura | Extrato e leitura; nenhuma ferramenta movimenta dinheiro (R89) | Passa |
| III. Provedor de IA intercambiavel | Ferramentas comuns aos dois provedores | Passa |
| IV. Custo por conta sob controle | Sem IA na importacao; sem parceiro pago (R81) | Passa |
| V. Uma fonte de verdade | Movimentacoes viram lancamentos comuns, com categoria e contraparte na entrada; importacao pelo painel e pelo WhatsApp com a mesma funcao | Passa |
| VI. Simplicidade de MVP | Leitor de OFX proprio, sem biblioteca; reaproveita o arquivo pendente da US2 | Passa |
| VII. Honestidade | Tela e README dizem que a conexao automatica nao existe ainda; resultado da importacao mostra o que foi ignorado e por que | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US7 entregues, US8 planejada
├── research.md          # R1 a R80 (US1 a US7), R81 a R90 (US8)
├── data-model.md        # secoes US1 a US8
├── quickstart.md        # secoes US1 a US8
├── contracts/           # US1 a US7, mais api-extratos.md e ferramentas-extratos.md (US8)
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US7 concluidas; US8 entra via /speckit-tasks
```

### Source Code (repository root), US8

```text
src/
├── ofx.ts           # novo: leitor de OFX 1.x e 2.x
├── extratos.ts      # novo: tabelas, contas bancarias, importacao, categoria, contraparte, uniao, estorno, fatura
├── db.ts            # colunas novas em transactions; estornadas fora de todas as consultas
├── tools.ts         # importar_extrato, contas_bancarias, fatura_do_cartao; [extrato] em consultar_transacoes
├── prompt.ts        # regras de OFX, fatura e so leitura
└── api.ts           # rotas /api/extratos; origem nas transacoes

web/src/
├── views/financas/ExtratosView.vue    # novo: importar, resultado, contas e cartoes, fechamento e vencimento, historico
├── views/financas/TransacoesView.vue  # selo extrato
├── mesas.ts, router.ts                # Extratos no submenu de Financas
└── api.ts                             # tipos

test/
├── ofx/corrente-1x.ofx, ofx/cartao-2x.ofx
└── extratos.test.ts
```

**Structure Decision**: `src/ofx.ts` so le o formato; `src/extratos.ts` tem a regra e recebe
movimentacoes ja lidas. Um parceiro de Open Finance, quando vier, entrega movimentacoes no mesmo
formato para `src/extratos.ts`.

## Ordem sugerida (US8)

1. Leitor de OFX com os arquivos de exemplo.
2. Tabelas, colunas e filtro de estornadas.
3. Importacao: contraparte, categoria, forma de pagamento, ignorados, uniao, estorno.
4. Fatura do cartao.
5. Rotas, ferramentas e prompt.
6. Painel: Extratos e selo nas transacoes.
7. README e quickstart.

## Fora desta entrega (US8)

- Conexao automatica pelo Open Finance (FR-032), aviso de consentimento (FR-034) e os cenarios 1
  e 4: dependem de contrato com parceiro (R81).
- Importar CSV.
- Investimentos, emprestimos e previsao de caixa.
- Qualquer movimentacao de dinheiro (proibida pela constituicao).

## Complexity Tracking

Sem violacoes da constituicao.
