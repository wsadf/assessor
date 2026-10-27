---

description: "Tarefas da User Story 1: conta compartilhada com convites e perfis"
---

# Tasks: Conta compartilhada com convites e perfis (US1)

**Input**: Design documents from `/specs/001-paridade-meu-assessor/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: incluidos. A constituicao (Fluxo de Desenvolvimento) exige teste para regra de dominio
nova, e isolamento por usuario e o principio I.

**Escopo**: so a US1. As historias 2 a 9 terao `tasks.md` depois dos proprios planos.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependencia de tarefa aberta)
- **[Story]**: historia da spec (aqui, sempre US1)
- Caminhos relativos a raiz do repositorio: back-end em `src/`, painel em `web/src/`, testes em
  `test/`

---

## Phase 1: Setup

**Purpose**: preparar o arquivo de testes da conta

- [X] T001 Criar `test/conta.test.ts` com o mesmo cabecalho de `test/core.test.ts` (imports de `node:test`, `node:assert/strict`, banco `:memory:` via `openDb`) e incluir o arquivo no script `test` de `package.json`: `node scripts/run.mjs --test test/core.test.ts test/conta.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: perfis, capacidades, tabelas e resolucao de contexto. Tudo que a US1 usa em
ferramenta, rota e tela.

**⚠️ CRITICAL**: nenhuma tarefa da Phase 3 comeca antes desta fase.

- [X] T002 [P] Criar `src/permissoes.ts` com o tipo `Perfil = "titular" | "completo" | "so_gastos" | "agenda_tarefas"`, o tipo `Capacidade = "despesas" | "receitas" | "agenda" | "tarefas" | "acessos"`, o mapa `CAPACIDADES` exatamente como a tabela de [research.md R5](research.md#r5-perfis-e-onde-a-permissao-e-aplicada) (titular: todas; completo: todas menos `acessos`; so_gastos: `despesas`; agenda_tarefas: `agenda` e `tarefas`), `pode(contexto, capacidade): boolean`, a classe `SemPermissao` com mensagem `"Sem permissao: o acesso de <nome> nesta conta nao inclui <area>."` e `PERFIS_CONVIDAVEIS = ["completo", "so_gastos", "agenda_tarefas"]`
- [X] T003 [P] Em `src/db.ts`, dentro de `openDb`, adicionar sem perder dados (mesmo laco de `ALTER TABLE ... ADD COLUMN` ja usado): `transactions.created_by TEXT`, `reminders.created_by TEXT`, `reminders.notify_phone TEXT`, `tasks.created_by TEXT`; incluir os campos nas interfaces `Transaction`, `Reminder` e `Task` como `string | null`
- [X] T004 Em `src/db.ts`, fazer `addTransaction`, `addInstallments`, `addReminder` e `addTask` aceitarem `created_by` opcional (e `notify_phone` em `addReminder`), gravando `null` quando ausente; trocar `dueReminders`/o envio em `src/scheduler.ts` para mandar a `COALESCE(notify_phone, phone)` (depende de T003)
- [X] T005 Criar `src/conta.ts` com `prepararTabelasConta(db)` que cria `account_members` (`member_phone TEXT PRIMARY KEY`, `account_phone TEXT NOT NULL`, `role TEXT NOT NULL CHECK (role IN ('completo','so_gastos','agenda_tarefas'))`, `invite_id INTEGER`, `joined_at TEXT NOT NULL`, `removed_at TEXT`, indice `(account_phone, removed_at)`), `account_invites` (`id INTEGER PRIMARY KEY`, `account_phone TEXT NOT NULL`, `code_hash TEXT NOT NULL UNIQUE`, `code_hint TEXT NOT NULL`, `role TEXT NOT NULL`, `label TEXT`, `expires_at TEXT NOT NULL`, `accepted_by TEXT`, `accepted_at TEXT`, `canceled_at TEXT`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`) e `invite_attempts` (`phone TEXT NOT NULL`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`), conforme [data-model.md](data-model.md) (depende de T002)
- [X] T006 Em `src/conta.ts`, implementar `resolverContexto(db, phone): Contexto` com `{ membro, conta, perfil, nome }`: `conta = account_members.account_phone` se houver linha com `removed_at IS NULL`, senao o proprio telefone; `perfil = "titular"` quando `membro == conta`, senao `role`; `nome` de `users.name` (depende de T005)
- [X] T007 Em `test/conta.test.ts`, testar `resolverContexto` (titular sem membros, membro ativo, membro removido volta a ser titular da propria conta) e `pode` para os quatro perfis (depende de T001, T006)

**Checkpoint**: contexto e capacidades prontos; fluxo atual inalterado (`npm test` verde).

---

## Phase 3: User Story 1 - Conta compartilhada com convites e permissoes (Priority: P1) 🎯 MVP

**Goal**: o titular convida pessoas por codigo, cada uma conversa pelo proprio WhatsApp e alimenta
a mesma conta, com perfil que limita o que ve e faz, e o titular ve e gerencia quem tem acesso.

**Independent Test**: com duas contas de WhatsApp (ou dois `CLI_PHONE`), o titular gera um
convite, a segunda pessoa entra com o codigo, registra um gasto e o titular ve esse gasto com o
nome de quem lancou. Com o perfil `so_gastos`, a segunda pessoa nao consegue consultar receitas
nem pelo assessor nem pela API.

### Tests for User Story 1

> Escrever antes da implementacao correspondente e ver falhar.

- [X] T008 [US1] Em `test/conta.test.ts`, testar convites: codigo no formato `CONV-` + 6 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`; guardado so como hash; aceitar cria o vinculo; codigo aceito, cancelado ou expirado (`expires_at` = criacao + 7 dias) e recusado com a mesma mensagem; 6a tentativa errada do mesmo telefone em 15 minutos devolve erro 429; limite de 10 convites pendentes por conta
- [X] T009 [US1] Em `test/conta.test.ts`, testar membros: `member_phone` em no maximo uma conta ativa (FR-006); titular nao pode ser removido; remover apaga as sessoes do membro em `sessions`; numero com lancamentos proprios entra em outra conta e, ao sair, volta a ver os proprios dados sem mistura (R8)
- [X] T010 [US1] Em `test/conta.test.ts`, testar a matriz de isolamento (SC-002, pelo menos 50 combinacoes): para cada perfil x cada ferramenta de `executeTool` x cada rota de [contracts/api-conta.md](contracts/api-conta.md#capacidade-por-rota-existente), confirmar recusa ou resposta filtrada; `so_gastos` perguntando receitas recebe a mensagem de `SemPermissao` sem valores; conta A nunca ve dados da conta B
- [X] T011 [US1] Em `test/conta.test.ts`, testar autoria e destino: gasto lancado por membro aparece em `listTransactions` da conta com `created_by` do membro; lembrete criado por membro e enviado pelo agendador ao WhatsApp do membro (`notify_phone`); historico de `recentHistory` fica separado por membro

### Implementation for User Story 1

**Dominio da conta**

- [X] T012 [US1] Em `src/conta.ts`, implementar `conta(db)` com: `gerarConvite(contaPhone, role, label?)` (devolve o codigo em claro uma unica vez; `code_hint` com os 2 ultimos caracteres; recusa com mais de 10 pendentes), `validarConvite(codigo, phone)` (registra tentativa errada em `invite_attempts`; 5 erradas em 15 minutos bloqueia; devolve titular, perfil e `temDadosProprios`), `aceitarConvite(codigo, phone)` (cria ou reativa a linha de `account_members`, marca `accepted_by`/`accepted_at`; recusa se o telefone for titular com membros ativos), `cancelarConvite(contaPhone, id)`, `listarConvites(contaPhone)` (ultimos 30 dias, com estado calculado `pendente|aceito|cancelado|expirado`), `listarMembros(contaPhone)`, `alterarPerfil(contaPhone, membro, role)`, `removerMembro(contaPhone, membro)` (preenche `removed_at`, `DELETE FROM sessions WHERE phone = membro`; recusa o titular) (depende de T005, T006)

**Assessor (WhatsApp e terminal)**

- [X] T013 [US1] Em `src/tools.ts`, trocar a assinatura para `executeTool(repo, ctx: Contexto, name, args)`, usar `ctx.conta` nas chamadas ao repo, gravar `created_by = ctx.membro` (e `notify_phone = ctx.membro` em lembretes) e conferir a capacidade de cada ferramenta conforme [contracts/ferramentas-agente.md](contracts/ferramentas-agente.md#capacidade-das-ferramentas-existentes); sem `receitas`, forcar `kind = "despesa"` em `consultar_transacoes` e nos resumos; sem capacidade, devolver o texto de `SemPermissao` (depende de T002, T004, T006)
- [X] T014 [US1] Em `src/tools.ts`, adicionar as ferramentas `listar_acessos`, `convidar_pessoa` (`perfil` em `completo|so_gastos|agenda_tarefas`, `rotulo?`), `alterar_acesso` (`pessoa`, `perfil`) e `remover_acesso` (`pessoa`, `confirmado: boolean`; sem `confirmado: true` so devolve "confirme com o usuario"), com schemas zod e capacidade `acessos` nas tres ultimas; `pessoa` casa por nome ou final do telefone e, se ambigua, devolve a lista (depende de T012, T013)
- [X] T015 [US1] Em `src/prompt.ts` e `src/agent.ts`, `runAgent(repo, phone, input)` passa a resolver o contexto, usar `ctx.membro` em `recentHistory`/`addHistory`, `ctx` em `executeTool` e incluir a linha `[Quem fala: <nome>, perfil <perfil> na conta de <titular>. Pode: <capacidades>.]` depois de `[Agora: ...]`, omitida quando o titular nao tem membros; acrescentar ao prompt de sistema uma regra curta: quando uma ferramenta responder "Sem permissao", repassar sem citar valores (depende de T013)
- [X] T016 [P] [US1] Em `src/providers/gemini.ts` e `src/providers/claude.ts`, conferir que as ferramentas novas aparecem nas declaracoes (as duas listas saem de `src/tools.ts`); ajustar so se houver lista fixa (depende de T014)
- [X] T017 [US1] Em `src/server.ts`, aceitar a mensagem quando `msg.from` estiver em `ALLOWED_NUMBERS` ou for membro ativo de uma conta cujo titular esta em `ALLOWED_NUMBERS`; manter a fila por telefone do membro (depende de T006)
- [X] T018 [P] [US1] Em `src/cli.ts`, nada alem do que `runAgent` ja resolve; conferir que `CLI_PHONE` de um membro funciona e documentar no comentario do topo, se existir (depende de T015)

**API do painel**

- [X] T019 [US1] Em `src/api.ts`, no hook `onRequest` das rotas privadas, guardar o `Contexto` (via `resolverContexto`) no lugar do telefone; `quem(req)` passa a devolver `ctx.conta`; a sessao do `PAINEL_TOKEN` vira contexto `titular` de `PAINEL_TELEFONE`; escritas gravam `created_by = ctx.membro` (depende de T006)
- [X] T020 [US1] Em `src/api.ts`, declarar a capacidade de cada rota existente conforme a tabela de [contracts/api-conta.md](contracts/api-conta.md#capacidade-por-rota-existente) e recusar com `403` e `{ "erro": "Seu acesso a esta conta nao inclui isso." }`; em `GET /financas`, `/analises`, `/pagamentos` e `/meses` sem `receitas`, omitir receitas, saldo, renda e projecao da resposta (depende de T019)
- [X] T021 [US1] Em `src/api.ts`, `GET /me` passa a devolver `conta: { titular, perfil, capacidades }`; `toTx` inclui `criadoPor` (nome de quem lancou, ou nulo) (depende de T019)
- [X] T022 [US1] Em `src/api.ts`, criar as rotas privadas `GET /conta/acessos`, `GET /conta/convites`, `POST /conta/convites`, `DELETE /conta/convites/:id`, `PATCH /conta/membros/:telefone`, `DELETE /conta/membros/:telefone` com os corpos e erros de [contracts/api-conta.md](contracts/api-conta.md#rotas-privadas); `POST /conta/convites` devolve `mensagemWhatsapp` pronta para encaminhar (depende de T012, T020)
- [X] T023 [US1] Em `src/api.ts` e `src/auth.ts`, criar `POST /api/auth/convite` (valida e devolve `titular`, `perfil`, `temDadosProprios`; `400` com mensagem unica para invalido/expirado/cancelado/usado; `409` para titular com membros ativos; `429` no limite); em `POST /api/auth/cadastro`, aceitar `convite` opcional e tornar `plano` opcional quando houver convite; em `POST /api/auth/ativar`, depois de `contas.ativar`, aceitar o convite pendente do cadastro e devolver `conta: { nome, titular, perfil }`, ou `aviso` se o convite expirou nesse meio-tempo (depende de T012)

**Painel web**

- [ ] T024 [P] [US1] Em `web/src/api.ts`, adicionar as chamadas `validarConvite`, `listarAcessos`, `listarConvites`, `criarConvite`, `cancelarConvite`, `alterarPerfil`, `removerMembro` e o campo `convite` no cadastro; tipar `conta` em `/me` (depende de T021, T022, T023)
- [ ] T025 [US1] Em `web/src/estado.ts`, `web/src/mesas.ts` e `web/src/router.ts`, guardar `capacidades` de `/me` e esconder mesas e rotas sem capacidade (Fiscal exige `receitas`; Agenda exige `agenda`; Tarefas exige `tarefas`); rota bloqueada leva para a primeira mesa permitida (depende de T024)
- [ ] T026 [P] [US1] Criar `web/src/views/operacao/AcessosView.vue` ("Equipe e acesso"): lista de titular e membros com perfil e data; para o titular, botao de convite com escolha de perfil e rotulo, codigo exibido uma vez com copiar e "enviar no WhatsApp", lista de convites com estado e cancelar, alterar perfil e remover membro com confirmacao; reaproveitar `EstadoVazio`, `StatusCarga` e o estilo das telas de Financas (depende de T024)
- [ ] T027 [US1] Em `web/src/views/OperacaoMesa.vue` e `web/src/router.ts`, ligar a rota `/operacao/acessos` a `AcessosView` e mostrar o atalho "Equipe e acesso" com a contagem de pessoas (depende de T026)
- [ ] T028 [P] [US1] Em `web/src/views/auth/CriarContaView.vue`, campo opcional "Tenho um codigo de convite": ao validar, mostrar "Voce vai entrar na conta de <titular>" (e o aviso de R8 quando `temDadosProprios`), pular os passos de plano e pagamento e seguir para a ativacao (depende de T024)
- [ ] T029 [P] [US1] Em `web/src/views/financas/FinancasPainel.vue`, `TransacoesView.vue` e `AnalisesView.vue`, esconder blocos de receita, saldo, renda e projecao quando faltar `receitas`; em `TransacoesView.vue`, mostrar `criadoPor` em cada lancamento quando a conta tiver membros (depende de T025)

**Checkpoint**: US1 completa; testes T007 a T011 verdes; roteiro do [quickstart.md](quickstart.md) passando.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Em `src/seed.ts`, criar no `data/demo.db` a pessoa Bia (`bia@assessor.local`, senha `demo1234`, perfil `so_gastos`) ligada a conta demo, com alguns gastos lancados por ela e um convite pendente
- [ ] T031 [P] Em `README.md`, documentar convites e perfis, a tela Equipe e acesso, o login demo da Bia, que membros precisam estar autorizados pelo titular em `ALLOWED_NUMBERS` e o limite de 5 destinatarios do numero de teste da Meta (principio VII); atualizar a tabela "Como esta organizado" com `src/conta.ts` e `src/permissoes.ts`
- [ ] T032 Rodar `npm run typecheck` e `npm test` e corrigir o que falhar
- [ ] T033 Executar o roteiro de [quickstart.md](quickstart.md) com `npm run painel:demo` e `npm run chat`, uma vez com `AI_PROVIDER=gemini` e outra com `AI_PROVIDER=claude` (principio III)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependencias
- **Foundational (Phase 2)**: depende do Setup; bloqueia a US1
- **US1 (Phase 3)**: depende da Phase 2
- **Polish (Phase 4)**: depende da US1

### Dentro da US1

```text
T012 (dominio) ──┬─> T014 (ferramentas novas) ─> T016
                 ├─> T022 (rotas /conta) ─┐
                 └─> T023 (cadastro)  ────┤
T013 (capacidade nas ferramentas) ─> T015 (agente) ─> T018
T019 (contexto na API) ─> T020 ─> T021 ───┤
                                          └─> T024 (cliente web) ─> T025 ─> T029
                                                                 ├─> T026 ─> T027
                                                                 └─> T028
T017 (webhook) depende so de T006
```

### Parallel Opportunities

- T002 e T003 em paralelo (arquivos diferentes).
- T008 a T011 tocam o mesmo arquivo (`test/conta.test.ts`): sequenciais.
- Depois de T024: T026, T028 em paralelo; T029 depois de T025.
- T030 e T031 em paralelo.

---

## Parallel Example: User Story 1

```bash
# Fundacao, arquivos diferentes:
Task: "Criar src/permissoes.ts com perfis e capacidades"
Task: "Adicionar created_by e notify_phone em src/db.ts"

# Painel, depois de T024:
Task: "Criar web/src/views/operacao/AcessosView.vue"
Task: "Campo de convite em web/src/views/auth/CriarContaView.vue"
```

---

## Implementation Strategy

### MVP (so a US1)

1. Phase 1 e Phase 2: contexto e capacidades, sem mudar comportamento.
2. Assessor primeiro (T012 a T018): ja permite validar pelo terminal com dois `CLI_PHONE`.
3. API (T019 a T023) e painel (T024 a T029).
4. **Parar e validar** com o [quickstart.md](quickstart.md).

### Entrega incremental

- Commit ao fim de cada bloco (fundacao, assessor, API, painel, polish), em Conventional Commits
  em portugues.
- As fases 2 e 3 do assessor ja entregam valor sem o painel: convite gerado pelo WhatsApp e
  aceito pelo cadastro existente depois de T023.

---

## Notes

- [P] = arquivos diferentes, sem dependencia aberta.
- Comentarios no codigo: so o porque, curtos, sem historico.
- Fora desta lista: transferencia de titularidade, exclusao de conta, entrar por WhatsApp,
  perfil contador (US7) e resumo por membro (US3).
