# Implementation Plan: Paridade com o Meu Assessor (US1 a US9)

**Branch**: `001-us9-cobranca` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 a US8 estao implementadas e na `main` (PRs #1 a #8; a
US8 entrou como extrato OFX, com o Open Finance adiado). Esta revisao planeja a ultima, a US9, com
cobranca por Pix na chave do proprio usuario e a nota fiscal adiada (decisao de 2026-10-27, R91),
amparada pela emenda 1.2.0 da constituicao.

## Summary

**US1 a US8, entregues**: conta compartilhada (R1 a R10), documentos (R11 a R22), avisos
proativos (R23 a R34), Google Agenda (R35 a R46), pagina de agendamento (R47 a R58), mensagens a
outras pessoas (R59 a R70), area do contador (R71 a R80) e extrato bancario (R81 a R90).

**US9, este plano**: o usuario cadastra a chave Pix no painel e pede "cobra R$ 850 do Joao pela
consultoria de agosto". O assessor cria a cobranca com um codigo Pix estatico (BR Code montado
pelo proprio servidor, sem parceiro) e devolve o link de uma pagina publica com QR e copia-e-cola;
se o usuario pedir, manda o link ao Joao pelas regras da US6. O dinheiro vai do banco do pagador
direto ao banco do usuario. O pagamento e confirmado pelo usuario ("o Joao pagou") ou pelo extrato
importado (credito com o mesmo valor e o nome do pagador), e vira receita sem duplicar. Pedido de
nota fiscal e de antecipacao recebe a explicacao. Detalhes em [research.md](research.md) R91 a R100.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13; painel em Vue 3 + Vue Router, com a
dependencia nova `qrcode` so no painel, para desenhar o QR (R93)

**Storage**: SQLite: `pix_keys`, `charges`

**Testing**: `node --test` via `npm test`, com `test/cobrancas.test.ts`; `npm run typecheck`;
`vue-tsc` no painel

**Target Platform**: servidor Node unico

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: cobranca criada e link devolvido no mesmo turno da conversa

**Constraints**: o produto nao inicia, intermedia nem guarda pagamento (principio II, 1.2.0);
confirmacao nunca presumida (R97); pagina publica sem dados da conta (R95); Pix estatico nao expira
e isso e dito ao cancelar (R98)

**Scale/Scope**: 5 rotas privadas e 1 publica, 4 ferramentas, `src/pix.ts` e `src/cobrancas.ts`,
telas Financas > Cobrancas e `/pagar/:slug`, ligacao com a importacao de extrato

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US9) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Cobrancas por conta; pagina publica so com recebedor, descricao, valor e codigo; `slug` aleatorio | Passa |
| II. Dinheiro so leitura (1.2.0) | Pix estatico na chave do usuario: o produto so monta o codigo e nao inicia nem guarda transacao; confirmacao pelo usuario ou pelo extrato; antecipacao e transferencia recusadas | Passa |
| III. Provedor de IA intercambiavel | Ferramentas comuns aos dois provedores | Passa |
| IV. Custo por conta sob controle | Sem parceiro e sem custo por cobranca; sem IA alem das ferramentas | Passa |
| V. Uma fonte de verdade | Pagamento confirmado vira receita comum, com contraparte; extrato e cobranca ligados sem duplicar | Passa |
| VI. Simplicidade de MVP | BR Code montado sem biblioteca; `qrcode` so para desenhar o QR no painel; envio ao pagador pela US6 | Passa |
| VII. Honestidade | Nota fiscal adiada dita na tela e na conversa; aviso de que o Pix estatico continua pagavel depois de cancelar | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US8 entregues, US9 planejada
├── research.md          # R1 a R90 (US1 a US8), R91 a R100 (US9)
├── data-model.md        # secoes US1 a US9
├── quickstart.md        # secoes US1 a US9
├── contracts/           # US1 a US8, mais api-cobrancas.md e ferramentas-cobrancas.md (US9)
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US8 concluidas; US9 entra via /speckit-tasks
```

### Source Code (repository root), US9

```text
src/
├── pix.ts           # novo: validacao de chave e payload BR Code com CRC16
├── cobrancas.ts     # novo: tabelas, chave, cobranca, confirmacao, cancelamento, pagina publica
├── extratos.ts      # credito que bate com cobranca aberta marca paga e liga a receita
├── tools.ts         # criar_cobranca, consultar_cobrancas, marcar_cobranca_paga, cancelar_cobranca
├── prompt.ts        # regras de cobranca, nota adiada e antecipacao
└── api.ts           # rotas /api/cobrancas e /api/pagar/:slug

web/src/
├── views/financas/CobrancasView.vue   # novo: chave Pix, nova cobranca, lista, recebida, cancelar, copiar
├── views/PagarPublico.vue             # novo: pagina publica com QR e copia-e-cola
├── mesas.ts, router.ts                # Cobrancas no submenu de Financas e rota publica /pagar/:slug
└── api.ts                             # tipos

test/
└── cobrancas.test.ts
```

**Structure Decision**: `src/pix.ts` so conhece o padrao do Banco Central; `src/cobrancas.ts` tem a
regra. Quando houver parceiro (Asaas, por exemplo), ele entra como outro jeito de gerar a cobranca
e de confirmar o pagamento, sem mudar a pagina nem as ferramentas.

## Ordem sugerida (US9)

1. `src/pix.ts` com o exemplo de referencia do padrao.
2. Tabelas, chave e cobranca.
3. Confirmacao pelo usuario e pelo extrato.
4. Rotas e pagina publica.
5. Ferramentas e prompt.
6. Painel: Cobrancas e pagina de pagamento.
7. README e quickstart.

## Fora desta entrega (US9)

- Nota fiscal de servico (FR-038, FR-039 com emissao) e o cenario 3.
- Cobranca por parceiro com boleto ou cartao, e confirmacao automatica sem extrato.
- Pix dinamico, cobranca recorrente, multa e juros por atraso.
- Lembrete de vencimento ao pagador.

## Complexity Tracking

Sem violacoes da constituicao.
