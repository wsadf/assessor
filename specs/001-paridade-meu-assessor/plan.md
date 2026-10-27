# Implementation Plan: Paridade com o Meu Assessor (US1 a US4)

**Branch**: `001-us4-google-agenda` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1), US2 (documentos, PR #2) e
US3 (avisos proativos, PR #3) estao implementadas e na `main`. Esta revisao planeja a US4 (Google
Agenda). As historias 5 a 9 entram depois.

## Summary

**US1, entregue**: conta compartilhada por convite, com perfis e permissao aplicada nas
ferramentas, nas rotas e numa visao do repo por perfil. Decisoes R1 a R10.

**US2, entregue**: guarda e busca de documentos pelo WhatsApp e pelo painel. Decisoes R11 a R22.

**US3, entregue**: contas a pagar, recorrencias, aviso de categoria, resumos por pessoa e fila de
avisos que a Meta recusa. Decisoes R23 a R34.

**US4, este plano**: cada pessoa conecta a propria conta Google (pelo painel ou por um link de uso
unico enviado no WhatsApp) com o escopo minimo `calendar.events`. A Lia passa a criar, consultar,
remarcar e cancelar compromissos no calendario principal a partir de texto ou audio, com
convidados, link do Meet, aviso de conflito e o lembrete do WhatsApp ligado ao evento. Sem conta
conectada, tudo continua como hoje (lembrete interno) com o convite para conectar. O refresh
token fica cifrado; chamadas por REST, sem SDK. O resumo da manha passa a trazer os compromissos
do dia. Detalhes em [research.md](research.md) R35 a R46.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13, SDK da Anthropic; Gemini e agora
Google Calendar via REST com `fetch`; painel em Vue 3. Nenhuma dependencia nova (cifra com
`node:crypto`).

**Storage**: SQLite: `google_accounts`, `google_auth`; coluna `reminders.google_event_id`. Eventos
nao sao copiados: lidos do Google quando preciso.

**Testing**: `node --test` via `npm test`, com `test/google.test.ts` e `fetch` simulado;
`npm run typecheck`; `vue-tsc` no painel

**Target Platform**: servidor Node unico; retorno do OAuth na mesma porta do painel

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: SC-005 (compromisso pedido por audio aparece no Google em menos de 15 s
depois da mensagem): uma listagem de conflito e uma criacao, cada uma com limite de 10 s

**Constraints**: escopo minimo; token cifrado; `state` e link de uso unico; Google em modo de teste
limita testadores e vence o refresh token em 7 dias (R45); sem configuracao, a agenda do Google
aparece como nao disponivel

**Scale/Scope**: 6 ferramentas novas, 5 rotas novas e 1 alterada, um modulo `src/google.ts`,
mudancas na mesa de Agenda e no resumo da manha

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US4) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Conexao por pessoa (R35); escopo minimo (R36); `state` contra CSRF e link de uso unico (R37); refresh token cifrado com AES-256-GCM (R38); desconectar revoga no Google e apaga (R43) | Passa |
| II. Dinheiro so leitura | Nada movimenta dinheiro | Passa |
| III. Provedor de IA intercambiavel | Ferramentas em `src/tools.ts`; Google independe do provedor | Passa |
| IV. Custo por conta sob controle | Sem IA extra; API do Google gratuita na cota padrao (R46) | Passa |
| V. Uma fonte de verdade | O calendario do Google e a fonte dos eventos; o produto so guarda o lembrete ligado | Passa |
| VI. Simplicidade de MVP | REST com `fetch`, sem SDK; cifra com `node:crypto` | Passa |
| VII. Honestidade | Sem configuracao, "nao disponivel"; acesso vencido avisa e reconecta; README diz os limites do modo de teste do Google (R45) | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US3 entregues, US4 planejada
├── research.md          # R1 a R34 (US1 a US3), R35 a R46 (US4)
├── data-model.md        # secoes US1 a US4
├── quickstart.md        # secoes US1 a US4
├── contracts/
│   ├── api-conta.md, ferramentas-agente.md          # US1
│   ├── api-documentos.md, ferramentas-documentos.md # US2
│   ├── api-avisos.md, ferramentas-avisos.md         # US3
│   └── api-google.md, ferramentas-agenda.md         # US4
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US3 concluidas; US4 entra via /speckit-tasks
```

### Source Code (repository root), US4

```text
src/
├── google.ts        # novo: tabelas, cifra do token, fluxo OAuth (state e link), renovacao, eventos (listar, criar, mover, apagar), revogar
├── config.ts        # google: clientId, clientSecret, tokenKey, painelUrl; configurado()
├── db.ts            # coluna reminders.google_event_id; chama prepararTabelasGoogle
├── tools.ts         # 6 ferramentas novas
├── prompt.ts        # regras de compromisso, conflito e consulta antes de mover
├── avisos.ts        # resumo da manha com os eventos do dia
├── scheduler.ts     # limpeza de google_auth
└── api.ts           # /api/google, /api/google/conectar, retorno publico, /api/agenda com eventos

web/src/
├── views/AgendaMesa.vue   # conexao (status, conectar, desconectar) e eventos do Google no dia
└── api.ts                 # tipos GoogleStatus e Evento

test/
└── google.test.ts   # incluido no script test

.env.example         # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY, PAINEL_URL
```

**Structure Decision**: mesmo layout das historias anteriores. Tudo que fala com o Google fica em
`src/google.ts`, como `whatsapp.ts` concentra a Meta; as ferramentas so chamam funcoes dele.

## Ordem sugerida (US4)

1. Config, tabelas e cifra, com testes.
2. Fluxo OAuth (state, link, troca, renovacao, revogar) com `fetch` simulado.
3. Eventos (listar, criar com conflito e Meet, mover, apagar) e lembrete ligado.
4. Ferramentas e prompt, com as falhas de R43.
5. Rotas da API, inclusive as publicas de conexao e retorno.
6. Painel: mesa de Agenda.
7. Resumo da manha, README, `.env.example`, quickstart com conta Google de teste.

## Fora desta entrega (US4)

- Outros calendarios (Outlook, iCloud) e agendas secundarias do Google.
- Aceitar ou recusar convites recebidos.
- Sincronizar lembretes antigos para o Google.
- Pagina publica de agendamento (US5, que depende desta).

## Complexity Tracking

Sem violacoes da constituicao.
