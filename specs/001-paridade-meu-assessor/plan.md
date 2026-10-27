# Implementation Plan: Paridade com o Meu Assessor (US1 a US6)

**Branch**: `001-us6-falar-por-voce` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1), US2 (documentos, PR #2),
US3 (avisos proativos, PR #3), US4 (Google Agenda, PR #4) e US5 (pagina de agendamento, PR #5)
estao implementadas e na `main`. Esta revisao planeja a US6 (mensagens a outras pessoas). As
historias 7 a 9 entram depois.

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

**US6, este plano**: o usuario pede "lembra o Joao de pagar o personal todo dia 5" ou "avisa meu
irmao do aniversario da mae dia 27". O assessor acha o contato (ou pede o numero), mostra a previa
com destinatario e texto e so grava depois da confirmacao. A mensagem sai pelo agendador, com a
identificacao "Aqui e o assessor de {usuario}" e a opcao PARAR montadas por codigo. A situacao vem
dos `statuses` da Meta; falha avisa o usuario. A resposta do contato e repassada literal a quem
pediu, sem IA; PARAR entra na lista unica de opt-out da US5 e cancela os recorrentes. Limite de 20
mensagens por conta e 3 por contato por dia. Detalhes em [research.md](research.md) R59 a R70.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13; WhatsApp Cloud API pela camada
existente; painel em Vue 3 + Vue Router. Nenhuma dependencia nova.

**Storage**: SQLite: `contacts`, `contact_sends`, `contact_messages`; `client_optouts` (US5) passa a
valer para contatos

**Testing**: `node --test` via `npm test`, com `test/contatos.test.ts` reaproveitando o WhatsApp
simulado de `test/googleFalso.ts`; `npm run typecheck`; `vue-tsc` no painel

**Target Platform**: servidor Node unico

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: envio pedido "agora" sai no proximo ciclo do agendador (ate 30 s); resposta
do contato repassada no mesmo processamento do webhook

**Constraints**: nunca enviar sem confirmacao (FR-025); identificacao e PARAR por codigo (FR-026);
zero mensagem a numero em opt-out (FR-027, SC-007); limite diario (FR-028); fala do contato nunca
passa pelo modelo (R66)

**Scale/Scope**: 3 ferramentas, 2 rotas privadas, 1 bloco na mesa de Agenda, `statuses` e cartao
de contato no webhook, roteamento novo de respostas, tarefa nova no agendador

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US6) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Contatos e envios por conta; o contato nunca conversa com o assessor nem ve dados (R66); a fala dele nao passa pelo modelo. O webhook continua ignorando numeros fora de `ALLOWED_NUMBERS`, com a mesma excecao estreita da US5: numero com mensagem recente da conta so chega ao interpretador fixo | Passa |
| II. Dinheiro so leitura | "Lembra o Joao de pagar" e so mensagem; nada de cobranca ou Pix | Passa |
| III. Provedor de IA intercambiavel | Ferramentas comuns aos dois provedores; previa e envio por codigo | Passa |
| IV. Custo por conta sob controle | Uma chamada de ferramenta por pedido; envio, situacao e respostas sem IA (R70) | Passa |
| V. Uma fonte de verdade | WhatsApp e painel leem as mesmas tabelas; cancelar pelos dois | Passa |
| VI. Simplicidade de MVP | Reaproveita `client_optouts`, `sendNotice`, `nextOccurrence` e a fila do agendador; sem dependencia nova | Passa |
| VII. Honestidade | Sem modelo aprovado a previa avisa que pode nao chegar; falha e limite viram aviso ao usuario; a situacao mostrada vem da Meta | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US5 entregues, US6 planejada
├── research.md          # R1 a R58 (US1 a US5), R59 a R70 (US6)
├── data-model.md        # secoes US1 a US6
├── quickstart.md        # secoes US1 a US6
├── contracts/
│   ├── api-conta.md, ferramentas-agente.md              # US1
│   ├── api-documentos.md, ferramentas-documentos.md     # US2
│   ├── api-avisos.md, ferramentas-avisos.md             # US3
│   ├── api-google.md, ferramentas-agenda.md             # US4
│   ├── api-agendamento.md, ferramentas-agendamento.md   # US5
│   └── api-contatos.md, ferramentas-contatos.md         # US6
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US5 concluidas; US6 entra via /speckit-tasks
```

### Source Code (repository root), US6

```text
src/
├── contatos.ts      # novo: tabelas, contato por nome, previa, pedido de envio, envio com limites e opt-out, situacao, respostas do contato
├── whatsapp.ts      # wamid no retorno do envio; statuses e cartao de contato no parseWebhook
├── scheduler.ts     # envios vencidos a contatos e limpeza das respostas antigas
├── server.ts        # statuses atualizam mensagens; resposta de contato vai para o interpretador, nunca para o agente
├── tools.ts         # 3 ferramentas novas
├── prompt.ts        # regras de previa, confirmacao e cancelamento
└── api.ts           # rotas privadas /api/contatos

web/src/
├── views/AgendaMesa.vue   # bloco Mensagens para outras pessoas
└── api.ts                 # tipos

test/
├── googleFalso.ts         # WhatsApp simulado devolve wamid
└── contatos.test.ts
```

**Structure Decision**: modulo novo `src/contatos.ts` no estilo de `src/agendamento.ts`. A lista de
opt-out continua em `client_optouts`, criada pela US5, agora lida pelos dois modulos.

## Ordem sugerida (US6)

1. Tabelas, contato por nome e previa, com testes.
2. Pedido de envio, agendador com limites, opt-out e `wamid`.
3. `statuses` no webhook e aviso de falha.
4. Respostas do contato e cartao de contato compartilhado.
5. Ferramentas e prompt.
6. API privada e bloco no painel.
7. README e quickstart com WhatsApp real.

## Fora desta entrega (US6)

- Criar envio pelo painel (so pelo WhatsApp).
- Resumo das respostas por IA; o texto e repassado literal.
- Grupos do WhatsApp, e-mail e SMS.
- Ler a agenda de contatos do celular ou o Google Contatos.

## Complexity Tracking

Sem violacoes da constituicao.
