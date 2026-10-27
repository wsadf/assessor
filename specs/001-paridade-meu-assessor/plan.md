# Implementation Plan: Paridade com o Meu Assessor (US1 a US7)

**Branch**: `001-us7-contador` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1), US2 (documentos, PR #2),
US3 (avisos proativos, PR #3), US4 (Google Agenda, PR #4), US5 (pagina de agendamento, PR #5) e US6
(mensagens a outras pessoas, PR #6) estao implementadas e na `main`. Esta revisao planeja a US7
(area do contador). As historias 8 e 9 entram depois.

## Summary

**US1, entregue**: conta compartilhada por convite, com perfis e permissao aplicada nas
ferramentas, nas rotas e numa visao do repo por perfil. Decisoes R1 a R10.

**US2, entregue**: guarda e busca de documentos pelo WhatsApp e pelo painel. Decisoes R11 a R22.

**US3, entregue**: contas a pagar, recorrencias, aviso de categoria, resumos por pessoa e fila de
avisos que a Meta recusa. Decisoes R23 a R34.

**US4, entregue**: conexao com o Google Agenda por pessoa e compromissos pela conversa, com
convidados, Meet, conflito e lembrete ligado. Decisoes R35 a R46.

**US5, entregue**: pagina publica de agendamento com horarios livres do Google, reserva sem
sobreposicao, confirmacao na vespera, respostas do cliente sem IA e remarcacao. Decisoes R47 a R58.

**US6, entregue**: recados pelo WhatsApp em nome do usuario, com previa, identificacao e PARAR por
codigo, limites, situacao da Meta e respostas repassadas sem IA. Decisoes R59 a R70.

**US7, este plano**: o titular gera um codigo `CONT-` (painel ou WhatsApp). O contador cria conta
no painel com o codigo, ou usa o codigo ja logado, e passa a ver, so para leitura, o dossie mensal
da conta: lancamentos e documentos fiscais (notas, comprovantes, boletos e qualquer comprovante de
lancamento). Baixa o mes num ZIP com a planilha CSV e os arquivos. O vinculo e uma tabela propria,
fora de `account_members`: o contador nao vira membro, nao conversa pelo WhatsApp da conta, pode ter
varios clientes, e cada pedido confere o vinculo, entao revogar vale na hora. Detalhes em
[research.md](research.md) R71 a R80.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13, `node:zlib` (deflate e `crc32`) para
o ZIP; painel em Vue 3 + Vue Router. Nenhuma dependencia nova.

**Storage**: SQLite: `accountant_invites`, `accountant_access`, coluna
`users.pending_accountant_invite_id`; arquivos dos documentos no disco (US2)

**Testing**: `node --test` via `npm test`, com `test/contador.test.ts`; `npm run typecheck`;
`vue-tsc` no painel

**Target Platform**: servidor Node unico

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: SC-008: dossie de um mes com ate 300 lancamentos baixado em menos de 30 s

**Constraints**: so leitura para o contador (FR-029); revogacao imediata (FR-031); dossie so com
documentos fiscais (R75); pacote ate 200 MB (R76)

**Scale/Scope**: 4 rotas do titular, 6 do contador, 1 ferramenta nova e 2 alteradas, tela nova
`/contador`, secao Contador em Acessos, `src/zip.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US7) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | So o titular concede; vinculo conferido a cada pedido, por conta; rotas do contador so de leitura e separadas; dossie sem documentos pessoais (R75); WhatsApp do contador nao entra na conta | Passa |
| II. Dinheiro so leitura | Nada movimenta dinheiro | Passa |
| III. Provedor de IA intercambiavel | Ferramenta comum aos dois provedores; area do contador sem IA | Passa |
| IV. Custo por conta sob controle | Sem chamada ao modelo na area do contador (R80) | Passa |
| V. Uma fonte de verdade | Dossie le as mesmas tabelas de lancamentos e documentos; convite e revogacao pelo painel e pelo WhatsApp | Passa |
| VI. Simplicidade de MVP | ZIP com `node:zlib`, sem biblioteca (R76); reaproveita cadastro, ativacao e limite de tentativas da US1 | Passa |
| VII. Honestidade | Arquivos que nao couberem no pacote aparecem no `LEIA-ME.txt`; acesso encerrado diz isso | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US6 entregues, US7 planejada
├── research.md          # R1 a R70 (US1 a US6), R71 a R80 (US7)
├── data-model.md        # secoes US1 a US7
├── quickstart.md        # secoes US1 a US7
├── contracts/
│   ├── api-conta.md, ferramentas-agente.md              # US1
│   ├── api-documentos.md, ferramentas-documentos.md     # US2
│   ├── api-avisos.md, ferramentas-avisos.md             # US3
│   ├── api-google.md, ferramentas-agenda.md             # US4
│   ├── api-agendamento.md, ferramentas-agendamento.md   # US5
│   ├── api-contatos.md, ferramentas-contatos.md         # US6
│   └── api-contador.md, ferramentas-contador.md         # US7
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US6 concluidas; US7 entra via /speckit-tasks
```

### Source Code (repository root), US7

```text
src/
├── contador.ts      # novo: tabelas, convite CONT-, vinculo, revogacao, meses, dossie, montagem do pacote
├── zip.ts           # novo: escritor de ZIP com node:zlib
├── api.ts           # rotas do titular em /api/conta/contador, rotas do contador em /api/contador, cadastro com CONT-, clientes em /api/me
├── tools.ts         # convidar_contador; listar_acessos e remover_acesso com contador
└── prompt.ts        # regra do convite do contador

web/src/
├── views/ContadorView.vue          # novo: clientes, codigo, mes, lancamentos, documentos, baixar
├── views/operacao/AcessosView.vue  # secao Contador
├── views/auth/CriarContaView.vue   # convite CONT- sem plano
├── router.ts, App.vue              # rota /contador e entrada no menu
└── api.ts                          # tipos

test/
└── contador.test.ts
```

**Structure Decision**: modulo novo `src/contador.ts`, separado de `src/conta.ts`, porque o vinculo
do contador nao e um membro. O ZIP fica em `src/zip.ts`, que nao conhece o dominio.

## Ordem sugerida (US7)

1. Tabelas, convite e vinculo, com testes.
2. Dossie do mes e `src/zip.ts`.
3. Rotas do titular e do contador, cadastro com `CONT-` e `/api/me`.
4. Ferramentas e prompt.
5. Painel: Acessos (titular) e Clientes (contador).
6. README e quickstart.

## Fora desta entrega (US7)

- Contador escolher pastas ou o titular liberar outras pastas.
- Exportar em formato de sistema contabil (OFX, SPED) ou integrar com escritorios.
- Contador comentar ou pedir documento pelo painel.
- Varios meses num pacote so.

## Complexity Tracking

Sem violacoes da constituicao.
