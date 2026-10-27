# Implementation Plan: Conta compartilhada com convites e perfis (US1)

**Branch**: `001-paridade-meu-assessor` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-paridade-meu-assessor/spec.md`

**Note**: este plano cobre so a User Story 1 (P1). As historias 2 a 9 terao planos proprios.

## Summary

Permitir que o titular convide pessoas por codigo para a mesma conta, cada uma com o proprio
WhatsApp e login, com perfil fixo (completo, so gastos, agenda e tarefas) e lista de quem tem
acesso. Abordagem: a conta continua sendo o telefone do titular; uma tabela de membros liga cada
numero a uma conta e o contexto (membro, conta, perfil) e resolvido uma vez na entrada. As
consultas atuais seguem filtrando por `phone`. A permissao e conferida nas ferramentas do
assessor e nas rotas da API, nunca so no prompt. Detalhes em [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 7 em ESM, Node 22

**Primary Dependencies**: Fastify 5, zod 4, better-sqlite3 13, SDK da Anthropic; Gemini via REST;
painel em Vue 3 + Vue Router + Vite. Nenhuma dependencia nova.

**Storage**: SQLite (`data/assessor.db`, `data/demo.db`), migracao por `CREATE TABLE IF NOT
EXISTS` e `ALTER TABLE ADD COLUMN` em `openDb` e `prepararTabelas`

**Testing**: `node --test` em `test/core.test.ts` via `npm test`; `npm run typecheck`

**Target Platform**: servidor Node unico (webhook + painel), navegador moderno para o painel

**Project Type**: web service com painel web (back-end em `src/`, front-end em `web/`)

**Performance Goals**: resolver o contexto de quem fala em uma consulta por mensagem; nenhuma
chamada extra ao modelo

**Constraints**: isolamento total entre contas e perfis (SC-002); custo de IA por conversa sobe
menos de 2% (R10); janela de 24 horas do WhatsApp inalterada

**Scale/Scope**: contas com ate dezenas de membros; 4 ferramentas novas, 6 rotas novas, 1 tela
nova no painel, ajustes em cadastro e ativacao

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Avaliacao | Status |
| --- | --- | --- |
| I. Dados financeiros sao do usuario | Toda leitura passa pela conta resolvida; perfis aplicados em ferramenta e rota; convite com hash, validade e limite de tentativas; sessoes do removido apagadas; teste de matriz perfil x ferramenta x rota | Passa |
| II. Dinheiro so leitura | Nada movimenta dinheiro | Passa |
| III. Provedor de IA intercambiavel | Ferramentas novas em `src/tools.ts`, prompt comum; quickstart valida com os dois provedores | Passa |
| IV. Custo por conta sob controle | +1 linha de contexto so quando ha membros; ferramentas no bloco com cache; historico continua por pessoa e limitado | Passa |
| V. Uma fonte de verdade | WhatsApp, terminal e painel resolvem o contexto pela mesma funcao e usam o mesmo repo | Passa |
| VI. Simplicidade de MVP | Sem dependencia nova; reaproveita `phone` como chave da conta em vez de migrar todas as tabelas | Passa |
| VII. Honestidade | Recusa explicita por falta de permissao; README atualizado com o fluxo de convite e o limite de 5 destinatarios do numero de teste | Passa |

Reavaliado apos a Fase 1 (data model e contratos): sem violacoes. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-paridade-meu-assessor/
├── spec.md
├── plan.md              # este arquivo (US1)
├── research.md          # decisoes R1 a R10
├── data-model.md        # tabelas novas e colunas
├── quickstart.md        # roteiro de validacao
├── contracts/
│   ├── api-conta.md           # rotas novas, alteradas e capacidade por rota
│   └── ferramentas-agente.md  # ferramentas novas e capacidade por ferramenta
├── checklists/
│   └── requirements.md
└── tasks.md             # gerado por /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── conta.ts         # novo: convites, membros, resolverContexto(phone)
├── permissoes.ts    # novo: perfis, capacidades, exigir(contexto, capacidade)
├── db.ts            # colunas created_by e notify_phone; repo grava autoria
├── auth.ts          # cadastro com convite; vinculo criado na ativacao
├── agent.ts         # historico por membro, ferramentas pela conta, linha de contexto
├── prompt.ts        # recebe o contexto de quem fala
├── tools.ts         # 4 ferramentas novas; capacidade em cada ferramenta
├── api.ts           # rotas /api/conta/*, /api/auth/convite; capacidade por rota; /me com conta
├── server.ts        # libera membros ativos de titulares autorizados
├── scheduler.ts     # envia lembrete para notify_phone
├── cli.ts           # resolve contexto do CLI_PHONE
└── seed.ts          # membro demo com perfil so_gastos

web/src/
├── views/operacao/AcessosView.vue  # novo: equipe e acesso, convites
├── views/OperacaoMesa.vue          # link para Equipe e acesso
├── views/auth/CriarContaView.vue   # campo de convite, pula plano e pagamento
├── views/financas/*                # esconde receitas e saldo sem a capacidade
├── mesas.ts, router.ts, estado.ts  # mesas e rotas filtradas por capacidades de /me
└── api.ts                          # chamadas novas

test/
└── core.test.ts     # testes listados no quickstart
```

**Structure Decision**: mantem o layout atual de um back-end em `src/` e o painel em `web/`. Os
dois modulos novos (`conta.ts`, `permissoes.ts`) seguem o estilo de `auth.ts`: funcoes sobre a
conexao do banco, sem camada extra.

## Ordem sugerida

1. `permissoes.ts` e `conta.ts` com testes (sem tocar no fluxo atual).
2. Colunas novas e autoria no repo.
3. Contexto no agente, ferramentas e prompt; testes de matriz.
4. Webhook, terminal e agendador.
5. API: hook de capacidade, rotas de conta, cadastro e ativacao com convite.
6. Painel: tela de acessos, cadastro com convite, mesas filtradas.
7. Seed, README e quickstart completo.

## Fora desta entrega

- Transferencia de titularidade e exclusao da conta (FR-042).
- Entrar na conta por mensagem no WhatsApp.
- Perfil contador (US7) e resumo da manha por membro (US3).

## Complexity Tracking

Sem violacoes da constituicao.
