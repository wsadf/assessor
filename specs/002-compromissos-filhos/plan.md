# Implementation Plan: Compromissos dos filhos

**Branch**: `002-compromissos-filhos` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-compromissos-filhos/spec.md`

## Summary

O usuario cadastra os filhos e registra compromissos deles (escola, aniversario de amigo, vacina,
consulta, outro) por conversa ou no painel. O assessor de agenda avisa antes de cada um, repete o
aniversario de amigo todo ano, lista o que vem por ai por filho e na semana, e o painel mostra tudo
na tela **Filhos**, dentro da mesa Agenda.

A abordagem reaproveita o que ja existe: um modulo novo `src/filhos.ts` com tres tabelas (filhos,
compromissos, vacinas); um tipo de aviso novo `filhos` no mecanismo de `avisos.ts`, com preferencia
por pessoa, deduplicacao em `notice_log` e fila para fora da janela de 24 horas; sete ferramentas
novas e duas linhas de prompt; rotas `/api/filhos`; e uma tela. O produto nao recomenda vacinas,
doses nem prazos, e nao ha exclusao de conta, o que fica dito na tela e no README (principio VII).
Decisoes em [research.md](research.md) R1 a R15.

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13; painel em Vue 3 + Vue Router.
Nenhuma dependencia nova.

**Storage**: SQLite: `children`, `child_events`, `child_vaccines`; `notice_prefs` ganha o tipo
`filhos` pela migracao que ja existe

**Testing**: `node --test` via `npm test`, com `test/filhos.test.ts` novo; `npm run typecheck`;
`vue-tsc` no painel

**Target Platform**: servidor Node unico

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: compromisso registrado e confirmado no mesmo turno da conversa; tela Filhos
carrega a semana de ate 10 filhos em menos de 1 segundo com o banco demo

**Constraints**: toda consulta filtra por conta (principio I); sem recomendacao de saude (FR-029,
principio VII); aviso uma vez por pessoa e por compromisso, mesmo com o agendador a cada 30 s (R5);
fuso e `TIMEZONE`; fora da janela de 24 horas o aviso vai para a fila (FR-015)

**Scale/Scope**: 10 rotas privadas, 7 ferramentas, `src/filhos.ts`, alteracoes em `avisos.ts`,
`scheduler.ts`, `tools.ts`, `prompt.ts`, `api.ts`, `db.ts`, `seed.ts`, uma tela nova no painel e um
teste novo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao | Status |
| --- | --- | --- |
| I. Dados sao do usuario | Tabelas por conta; toda rota e ferramenta filtra por `ctx.conta` e exige `agenda`; id de outra conta devolve 404; sem nome de filho em URL nem em log. Dado de crianca e de saude e sensivel: guarda so nome ou apelido e data de nascimento, e o texto dos compromissos. A regra de IA com treino ja vale | Passa |
| II. Dinheiro so leitura | A feature nao toca em dinheiro. Presente e so uma anotacao de texto | Passa |
| III. Provedor de IA intercambiavel | Sete ferramentas e duas linhas de prompt comuns; nada em `src/providers/` | Passa |
| IV. Custo por conta | Sem chamada extra ao modelo; definicoes de ferramenta entram no bloco com cache, cerca de 1.500 tokens a mais (R10); avisos sao calculo local | Passa |
| V. Uma fonte de verdade | WhatsApp, terminal e painel usam as mesmas funcoes de `src/filhos.ts`; nenhuma regra e reescrita no painel | Passa |
| VI. Simplicidade de MVP | Sem biblioteca nova; reaproveita aviso, preferencia, fila e deduplicacao; aniversario do filho derivado, sem tabela; sem nova mesa | Passa |
| VII. Honestidade | Sem calendario de vacinas, dito na resposta e na tela; nao ha exclusao de conta e isso consta no README (R12); foto de convite fora, dito ao usuario; o assessor nao inventa doses nem datas | Passa |

Restricoes tecnicas: `npm run typecheck` e `npm test` passam antes do commit; horarios no fuso da
conta; nenhuma variavel de ambiente nova (nada para `.env.example`); texto em portugues, sem
travessao; README atualizado na mesma entrega.

Reavaliado apos a Fase 1: sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/002-compromissos-filhos/
├── spec.md
├── plan.md
├── research.md          # R1 a R15
├── data-model.md        # children, child_events, child_vaccines, chaves de aviso
├── quickstart.md        # roteiro por historia
├── contracts/
│   ├── api-filhos.md
│   └── ferramentas-filhos.md
├── checklists/
│   └── requirements.md
└── tasks.md             # entra via /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── filhos.ts        # novo: tabelas, filhos, compromissos, vacinas, repeticao, textos, avisos devidos
├── avisos.ts        # tipo `filhos` em TIPOS_AVISO, padraoLigado, linha no resumo da manha
├── scheduler.ts     # case "filhos" em rodarAvisos, lembrete semanal de "a marcar", avancarRepetidos
├── tools.ts         # 7 ferramentas: esquema, capacidade agenda, declaracao e case
├── prompt.ts        # 2 linhas sobre filhos e vacinas
├── api.ts           # rotas /api/filhos, CAPACIDADE_ROTA
├── db.ts            # prepararTabelasFilhos em openDb
└── seed.ts          # filhos de demonstracao e limpeza das tabelas novas

web/src/
├── views/agenda/FilhosView.vue   # novo: cartoes por filho, semana, filtros, formularios, vacinas
├── views/AgendaMesa.vue          # botao "Filhos"
├── router.ts                     # rota /agenda/filhos (mesa agenda)
├── mesas.ts, App.vue             # titulo "Agenda / Filhos" no topo
└── api.ts                        # tipos Filho, Compromisso, Vacina; TipoAviso ganha "filhos"

test/
├── filhos.test.ts                # novo
└── avisos.test.ts                # lista de tipos de aviso passa a incluir `filhos`

package.json                      # test/filhos.test.ts na lista do npm test
README.md                         # secao Filhos, limites e aviso de dados sensiveis
```

**Structure Decision**: `src/filhos.ts` concentra a regra e nao conhece WhatsApp nem HTTP, como
`cobrancas.ts`. Ferramentas, rotas e agendador so chamam as funcoes dele. O aviso de data e puro: uma
funcao `avisosDevidos(db, conta, hoje)` devolve o que sai, e o agendador entrega com `entregar`, o que
permite testar com datas simuladas sem relogio.

## Ordem sugerida

1. Tabelas e regras de filho em `src/filhos.ts`, com o teste de cadastro, limite e isolamento.
2. Compromissos: criar, listar, concluir, remarcar, cancelar, presente, "a marcar".
3. Aviso: tipo `filhos`, `avisosDevidos`, aniversario do filho, repeticao anual e lembrete semanal;
   ajuste do teste de fundacao dos avisos.
4. Consulta: proximos, semana e agrupamento por filho.
5. Vacinas e consulta de rotina com repeticao.
6. Ferramentas e prompt, com teste das sete.
7. Rotas e testes de rota (perfil sem agenda, outra conta).
8. Tela Filhos no painel.
9. Dados de demonstracao, README, quickstart e verificacao com `npm run painel:demo`.

## Fora desta entrega

- Calendario oficial de vacinacao e qualquer indicacao de vacina, dose ou prazo (FR-029).
- Leitura de foto de convite ou de bilhete, e anexo de documento a um filho.
- Grade de horarios, notas e integracao com escola ou plano de saude.
- Exclusao da conta inteira (o produto ainda nao tem); `apagarFilhosDaConta` fica pronta para ela.
- Aviso "no dia" alem do resumo da manha.

## Complexity Tracking

Sem violacoes da constituicao.
