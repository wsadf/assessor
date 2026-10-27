# Implementation Plan: Paridade com o Meu Assessor (US1 a US5)

**Branch**: `001-us5-agendamento` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: o plano cresce por historia. US1 (conta compartilhada, PR #1), US2 (documentos, PR #2),
US3 (avisos proativos, PR #3) e US4 (Google Agenda, PR #4) estao implementadas e na `main`. Esta
revisao planeja a US5 (pagina publica de agendamento). As historias 6 a 9 entram depois.

## Summary

**US1, entregue**: conta compartilhada por convite, com perfis e permissao aplicada nas
ferramentas, nas rotas e numa visao do repo por perfil. Decisoes R1 a R10.

**US2, entregue**: guarda e busca de documentos pelo WhatsApp e pelo painel. Decisoes R11 a R22.

**US3, entregue**: contas a pagar, recorrencias, aviso de categoria, resumos por pessoa e fila de
avisos que a Meta recusa. Decisoes R23 a R34.

**US4, entregue**: conexao com o Google Agenda por pessoa e compromissos pela conversa, com
convidados, Meet, conflito e lembrete ligado. Decisoes R35 a R46.

**US5, este plano**: quem atende clientes ativa uma pagina publica (`/agendar/<slug>` aleatorio)
com duracoes, dias, janela, antecedencia e horizonte. O cliente, sem conta, escolhe duracao, dia e
um horario realmente livre no Google Agenda de quem atende, informa nome, e-mail e WhatsApp e
confirma; o evento entra no calendario com o cliente convidado. Na vespera, o cliente recebe a
confirmacao pelo modelo aprovado do WhatsApp e responde 1, 2 ou PARAR, tratados por codigo, sem
IA e sem acesso aos dados do dono. Pedindo ao assessor, o dono remarca e o cliente escolhe entre
tres horarios livres. Dois pedidos para o mesmo horario: so um passa. Detalhes em
[research.md](research.md) R47 a R58.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13; Google Calendar pela camada da US4;
painel em Vue 3 + Vue Router. Nenhuma dependencia nova.

**Storage**: SQLite: `booking_pages`, `bookings`, `client_optouts`; tipo de aviso `agendamentos`

**Testing**: `node --test` via `npm test`, com `test/agendamento.test.ts` reaproveitando o Google
simulado; `npm run typecheck`; `vue-tsc` no painel

**Target Platform**: servidor Node unico; pagina publica servida pelo painel compilado

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: SC-006 (cliente conclui o agendamento em menos de 1 minuto): uma chamada ao
Google por dia consultado e duas na reserva (conferencia e criacao), cada uma com limite de 10 s

**Constraints**: nunca expor compromissos ou contato do dono na pagina publica; reserva sem
sobreposicao (R52); mensagem ao cliente so com consentimento e pelo modelo aprovado (R54); resposta
do cliente nunca chega ao assessor de IA (R55)

**Scale/Scope**: 3 rotas publicas e 6 privadas, 4 ferramentas, 1 pagina publica nova, 1 bloco na
mesa de Agenda, roteamento novo no webhook, tarefa nova no agendador

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao (US5) | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Pagina publica devolve so horarios livres (R50); `slug` aleatorio e trocavel (R48); cliente nunca conversa com o assessor de IA nem ve dados da conta (R55); dados do cliente com consentimento e apagados em 90 dias (R53, R58); limites contra reserva falsa | Passa |
| II. Dinheiro so leitura | Agendamento sem cobranca nesta entrega | Passa |
| III. Provedor de IA intercambiavel | Ferramentas comuns aos dois provedores; fluxo do cliente sem IA | Passa |
| IV. Custo por conta sob controle | Pagina, reserva, confirmacao e respostas sem IA (R58) | Passa |
| V. Uma fonte de verdade | O Google Agenda de quem atende decide o que esta livre; a reserva vira evento nele | Passa |
| VI. Simplicidade de MVP | Janela unica por pagina; conflito resolvido pela transacao sincrona do SQLite, sem trava externa (R52) | Passa |
| VII. Honestidade | Sem Google, a pagina nao ativa e diz por que; sem modelo aprovado, a confirmacao nao sai e o dono e avisado (R54); horarios mostrados no fuso do cliente com aviso (R51) | Passa |

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # US1 a US4 entregues, US5 planejada
├── research.md          # R1 a R46 (US1 a US4), R47 a R58 (US5)
├── data-model.md        # secoes US1 a US5
├── quickstart.md        # secoes US1 a US5
├── contracts/
│   ├── api-conta.md, ferramentas-agente.md              # US1
│   ├── api-documentos.md, ferramentas-documentos.md     # US2
│   ├── api-avisos.md, ferramentas-avisos.md             # US3
│   ├── api-google.md, ferramentas-agenda.md             # US4
│   └── api-agendamento.md, ferramentas-agendamento.md   # US5
├── checklists/
│   └── requirements.md
└── tasks.md             # US1 a US4 concluidas; US5 entra via /speckit-tasks
```

### Source Code (repository root), US5

```text
src/
├── agendamento.ts   # novo: tabelas, pagina (config, slug), horarios livres, reserva com conflito, remarcacao, textos ao cliente, respostas do cliente, limpeza
├── avisos.ts        # tipo de aviso agendamentos
├── scheduler.ts     # confirmacao da vespera as 18h e limpeza de reservas presas e dados antigos
├── server.ts        # mensagem de cliente com agendamento vai para o interpretador, nunca para o agente
├── tools.ts         # 4 ferramentas novas
├── prompt.ts        # regras de remarcar e link
└── api.ts           # plugin publico /api/agendar e rotas privadas /api/agendamento

web/src/
├── views/AgendarPublico.vue   # novo: pagina publica (duracao, dia, horario, dados, confirmado)
├── views/AgendaMesa.vue       # bloco Pagina de agendamento e lista de agendamentos
├── router.ts                  # rota publica /agendar/:slug
└── api.ts                     # tipos

test/
└── agendamento.test.ts
```

**Structure Decision**: o modulo novo `src/agendamento.ts` segue o estilo dos anteriores e usa
`src/google.ts` para falar com o calendario. A pagina publica e uma rota do painel com
`meta.publica`, como entrar e criar conta.

## Ordem sugerida (US5)

1. Tabelas, configuracao da pagina e horarios livres, com testes.
2. Reserva com conflito, evento e lembrete do dono.
3. API publica e pagina publica no painel.
4. Bloco no painel do dono e API privada.
5. Confirmacao da vespera, interpretador de respostas no webhook e opt-out.
6. Remarcacao pelo assessor (ferramentas) e avisos ao dono.
7. README e quickstart com Google e WhatsApp reais.

## Fora desta entrega (US5)

- Janelas diferentes por dia, intervalos entre atendimentos, feriados.
- Cobranca ou sinal na reserva (US9).
- Lembrete por e-mail; confirmacao so pelo WhatsApp.
- Varias paginas por pessoa ou por servico.

## Complexity Tracking

Sem violacoes da constituicao.
