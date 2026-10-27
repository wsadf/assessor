---

description: "Tarefas da feature 001: US1 a US3 (concluidas) e US4 (Google Agenda)"
---

# Tasks: Paridade com o Meu Assessor (US1 a US4)

**Input**: Design documents from `/specs/001-paridade-meu-assessor/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: incluidos. A constituicao (Fluxo de Desenvolvimento) exige teste para regra de dominio
nova, e isolamento por usuario e o principio I.

**Escopo**: fases 1 a 4 sao da US1 (T001 a T033, PR #1); fases 5 a 8 da US2 (T034 a T064, PR #2);
fases 9 a 12 da US3 (T065 a T097, PR #3); fases 13 a 16 da US4 (T098 em diante). As historias 5 a 9
entram aqui depois dos proprios planos.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependencia de tarefa aberta)
- **[Story]**: historia da spec (US1 a US4)
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

- [X] T024 [P] [US1] Em `web/src/api.ts`, adicionar as chamadas `validarConvite`, `listarAcessos`, `listarConvites`, `criarConvite`, `cancelarConvite`, `alterarPerfil`, `removerMembro` e o campo `convite` no cadastro; tipar `conta` em `/me` (depende de T021, T022, T023)
- [X] T025 [US1] Em `web/src/estado.ts`, `web/src/mesas.ts` e `web/src/router.ts`, guardar `capacidades` de `/me` e esconder mesas e rotas sem capacidade (Fiscal exige `receitas`; Agenda exige `agenda`; Tarefas exige `tarefas`); rota bloqueada leva para a primeira mesa permitida (depende de T024)
- [X] T026 [P] [US1] Criar `web/src/views/operacao/AcessosView.vue` ("Equipe e acesso"): lista de titular e membros com perfil e data; para o titular, botao de convite com escolha de perfil e rotulo, codigo exibido uma vez com copiar e "enviar no WhatsApp", lista de convites com estado e cancelar, alterar perfil e remover membro com confirmacao; reaproveitar `EstadoVazio`, `StatusCarga` e o estilo das telas de Financas (depende de T024)
- [X] T027 [US1] Em `web/src/views/OperacaoMesa.vue` e `web/src/router.ts`, ligar a rota `/operacao/acessos` a `AcessosView` e mostrar o atalho "Equipe e acesso" com a contagem de pessoas (depende de T026)
- [X] T028 [P] [US1] Em `web/src/views/auth/CriarContaView.vue`, campo opcional "Tenho um codigo de convite": ao validar, mostrar "Voce vai entrar na conta de <titular>" (e o aviso de R8 quando `temDadosProprios`), pular os passos de plano e pagamento e seguir para a ativacao (depende de T024)
- [X] T029 [P] [US1] Em `web/src/views/financas/FinancasPainel.vue`, `TransacoesView.vue` e `AnalisesView.vue`, esconder blocos de receita, saldo, renda e projecao quando faltar `receitas`; em `TransacoesView.vue`, mostrar `criadoPor` em cada lancamento quando a conta tiver membros (depende de T025)

**Checkpoint**: US1 completa; testes T007 a T011 verdes; roteiro do [quickstart.md](quickstart.md) passando.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T030 [P] Em `src/seed.ts`, criar no `data/demo.db` a pessoa Bia (`bia@assessor.local`, senha `demo1234`, perfil `so_gastos`) ligada a conta demo, com alguns gastos lancados por ela e um convite pendente
- [X] T031 [P] Em `README.md`, documentar convites e perfis, a tela Equipe e acesso, o login demo da Bia, que membros precisam estar autorizados pelo titular em `ALLOWED_NUMBERS` e o limite de 5 destinatarios do numero de teste da Meta (principio VII); atualizar a tabela "Como esta organizado" com `src/conta.ts` e `src/permissoes.ts`
- [X] T032 Rodar `npm run typecheck` e `npm test` e corrigir o que falhar
- [ ] T033 Executar o roteiro de [quickstart.md](quickstart.md) com `npm run painel:demo` e `npm run chat`, uma vez com `AI_PROVIDER=gemini` e outra com `AI_PROVIDER=claude` (principio III)
  - 2026-10-27: painel conferido (titular e Bia) e terminal com Gemini (titular e membro so gastos) ok. Falta o Claude: sem `ANTHROPIC_API_KEY` no `.env`.

---

## Phase 5: Setup (US2)

**Purpose**: arquivo de testes e configuracao de arquivos. Decisoes em
[research.md](research.md) R11 a R22; tabela em [data-model.md](data-model.md#us2-documentos).

- [X] T034 Criar `test/documentos.test.ts` com o mesmo cabecalho de `test/conta.test.ts` (variaveis de ambiente, `openDb(":memory:")`, helper `contaCom`) e incluir o arquivo no script `test` de `package.json`: `node scripts/run.mjs --test test/core.test.ts test/conta.test.ts test/documentos.test.ts`
- [X] T035 [P] Em `src/config.ts`, acrescentar `arquivos: { maxBytes: 20971520, contaBytes: 1073741824, modeloBytes: 5242880, pendenteHoras: 24 }` (20 MB por arquivo, 1 GB por conta, ate 5 MB vai ao modelo, pendente vence em 24 h)

---

## Phase 6: Foundational (US2)

**Purpose**: tabela, pasta de arquivos, busca e visibilidade. Bloqueia a Phase 7.

- [X] T036 [P] Em `src/permissoes.ts`, acrescentar a capacidade `"documentos"` ao tipo `Capacidade`, ao `titular` e ao `completo` em `CAPACIDADES`, e `documentos: "os documentos"` em `NOME_AREA`; em `web/src/api.ts`, acrescentar `"documentos"` ao tipo `Capacidade` e mudar o detalhe de `completo` em `PERFIS` para "vê e lança gastos, receitas, agenda, tarefas e documentos"
- [X] T037 Criar `src/documentos.ts` com `prepararTabelasDocumentos(db)` (chamada no fim de `openDb` em `src/db.ts`): tabela `documents` exatamente como [data-model.md](data-model.md#documents-nova) (`status TEXT NOT NULL CHECK (status IN ('pendente','guardado'))`, `folder` com CHECK na lista de pastas ou NULL, `title` ate 120, `description` ate 600, `size_bytes` de 1 a 20971520, `storage_path TEXT NOT NULL UNIQUE`), os tres indices, a tabela virtual `documents_fts` (`fts5(title, description, original_name, folder, content='documents', content_rowid='id', tokenize='unicode61 remove_diacritics 2')`) e gatilhos `AFTER INSERT/UPDATE/DELETE` que a mantem; exportar `PASTAS` com id e nome exibido: boletos "Boletos", notas_fiscais "Notas fiscais", comprovantes "Comprovantes", contratos "Contratos", casa "Casa", carro "Carro", saude "Saúde", trabalho "Trabalho", pessoais "Pessoais", outros "Outros" (depende de T035)
- [X] T038 Em `src/documentos.ts`, `pastaDeArquivos(db)`: derivada de `db.name` trocando a extensao `.db` por `-arquivos` (`data/assessor.db` vira `data/assessor-arquivos`, `data/demo.db` vira `data/demo-arquivos`); banco `:memory:` usa `os.tmpdir()/assessor-arquivos-<pid>`; criar com `fs.mkdirSync(..., { recursive: true })` (depende de T037)
- [X] T039 Em `src/documentos.ts`, implementar `documentos(db)` com: `salvarPendente(conta, membro, { data: Buffer, mimeType, nomeOriginal })` (recusa acima de `maxBytes` com `AuthError(413, "Esse arquivo passa de 20 MB. Mande uma versao menor.")`; grava em `<pasta>/<conta>/<id>-<8 hex de crypto.randomBytes(4)>.<ext>`; fotos sem nome viram `foto-AAAAMMDD-HHMM.jpg`), `ultimoPendente(membro)` (o mais recente com `status = 'pendente'` e `created_by = membro`), `guardar(id, { pasta, titulo, descricao, dataDocumento?, transacaoId? })` (recusa se passar `contaBytes` com 507 e mensagem clara; devolve `{ documento, uso, alerta }` com `alerta` a partir de 80%), `buscar(conta, consulta, { pasta?, de?, ate?, limite = 8 })` (FTS5 com cada palavra como prefixo `palavra*` unidas por `OR`, so `status = 'guardado'`, ordem por `bm25` e depois `created_at DESC`; aspas e operadores do usuario sao removidos), `listar(conta, { pasta?, pagina? })` (30 por pagina), `pastasComUso(conta)`, `ler(id)` (devolve `{ doc, data: Buffer }`), `atualizar(id, { pasta?, titulo?, descricao? })`, `excluir(id)` (apaga arquivo e linha), `comprovanteDe(conta, transacaoId)` e `limparPendentes(agora)` (apaga arquivo e linha dos pendentes com mais de `pendenteHoras`) (depende de T038)
- [X] T040 Em `src/documentos.ts`, `podeVerDocumento(repo, ctx, doc)`: pendente so para `doc.created_by === ctx.membro`; guardado de outra conta nunca; com `documentos`, todo guardado da conta; sem `documentos`, so se `doc.transaction_id` existir e `repoDoContexto(repo, ctx).getTransaction(ctx.conta, doc.transaction_id)` devolver a transacao (R18) (depende de T036, T039)
- [X] T041 Em `test/documentos.test.ts`, testar o dominio: pendente salvo no disco e invisivel para outra pessoa; `guardar` muda status e entra na busca; busca "contrato apartamento marco" acha "Contrato do apartamento assinado em março"; consulta sem resultado devolve lista vazia; arquivo de 20971521 bytes recusado; aviso de uso a partir de 80% (simular com `contaBytes` pequeno via linha direta no banco ou parametro de teste); `limparPendentes` apaga pendente vencido do disco e do banco e mantem o guardado; `excluir` apaga o arquivo; `podeVerDocumento` para titular, completo, so_gastos (so comprovante de despesa visivel), agenda_tarefas e conta B (depende de T034, T040)

**Checkpoint**: modulo de documentos pronto e testado; nada exposto ainda.

---

## Phase 7: User Story 2 - Guarda e busca de documentos (Priority: P2)

**Goal**: o usuario manda PDF ou foto pelo WhatsApp, o assessor guarda numa pasta com titulo e
descricao, e devolve o arquivo quando pedem por descricao; o painel lista, busca, baixa, renomeia,
move e exclui.

**Independent Test**: enviar tres arquivos de tipos diferentes, conferir que cada um caiu na pasta
certa e recuperar um deles descrevendo o conteudo sem citar o nome do arquivo (spec, US2).

### Tests for User Story 2

> Escrever antes da implementacao correspondente e ver falhar.

- [X] T042 [US2] Em `test/documentos.test.ts`, testar as ferramentas: `guardar_documento` sem pendente responde "Nenhum arquivo recebido para guardar"; com pendente, guarda com a pasta e o titulo dados; `buscar_documentos` lista `#id titulo (pasta, data)`; `enviar_documento` chama o callback `enviarArquivo` com o documento e nao envia de outra conta; `mover_documento` e `excluir_documento` (este pede confirmacao sem `confirmado: true`); `registrar_transacao` em turno com anexo pendente guarda o comprovante ligado a transacao e responde "Comprovante guardado (#id)."; matriz por perfil das 6 ferramentas (titular e completo liberados; so_gastos e agenda_tarefas recebem "Sem permissao", exceto `enviar_documento` do comprovante visivel)
- [X] T043 [US2] Em `test/documentos.test.ts`, testar a API com `buildServer` e sessao: `GET /api/documentos` com pastas, uso e busca; `PATCH` renomeia e move; `DELETE` apaga o arquivo do disco; `GET /api/documentos/:id/arquivo` devolve bytes e `Content-Type`, e `404` para documento de outra conta, pendente de outra pessoa e (para so_gastos) documento sem ligacao; so_gastos baixa o comprovante do gasto dela; `GET /api/transacoes` traz `comprovanteId`; `403` nas rotas de lista para so_gastos e agenda_tarefas
- [X] T044 [US2] Em `test/documentos.test.ts`, testar o webhook: `parseWebhook` le `document` com `filename`, `mime_type` e `caption`; mensagem `document` de membro autorizado vira pendente e chega ao provedor como `document` (fetch simulado, como em `test/conta.test.ts`); o arquivo pedido e enviado depois do texto (upload em `/media` e mensagem `document` simulados)

### Implementation for User Story 2

**WhatsApp e provedores**

- [X] T045 [P] [US2] Em `src/whatsapp.ts`: tipo `Incoming` com `{ type: "document"; mediaId; filename?: string; mimeType?: string; caption?: string }` e leitura em `parseWebhook`; `uploadMedia(data, mimeType, filename)` com `FormData` e `Blob` nativos em `POST /{phone-number-id}/media` (`messaging_product: "whatsapp"`), devolvendo o media id; `sendDocument(to, { data, mimeType, filename, caption? })` que envia `type: "image"` para imagens e `type: "document"` (com `filename`) para o resto
- [X] T046 [P] [US2] Em `src/prompt.ts`, `UserInput` ganha `document?: Media & { filename: string }`; em `src/providers/gemini.ts`, `document` vira `inlineData` igual a imagem; em `src/providers/claude.ts`, PDF vira bloco `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }` e imagem vira bloco `image`
- [X] T047 [US2] Em `src/server.ts`, `toUserInput`: para `image` e `document`, baixar a midia, resolver o contexto e chamar `salvarPendente`; arquivo acima de 20 MB responde a mensagem de T039 sem chamar a IA; PDF ou imagem de ate `modeloBytes` vai ao provedor (`image` ou `document`); outro formato ou maior que isso vai so como texto `[arquivo <nome>, <tamanho>, nao lido]` + legenda; passar a `runAgent` a opcao `enviarArquivo` que chama `sendDocument` depois de `sendText` (depende de T039, T045, T046)

**Assessor**

- [X] T048 [US2] Em `src/agent.ts`, `runAgent(repo, phone, input, opcoes?: { enviarArquivo?: (doc, data) => Promise<void> })`: coleta os ids pedidos por `enviar_documento` durante o turno e, depois de gravar o historico, entrega cada um a `enviarArquivo`; o historico guarda `[documento] <nome>: <legenda>`; `executeTool` recebe um quarto parametro `extras: { anexoId?: number; enviar?: (id: number) => void }` com o pendente do turno (depende de T039)
- [X] T049 [US2] Em `src/tools.ts`, acrescentar as 6 ferramentas de [contracts/ferramentas-documentos.md](contracts/ferramentas-documentos.md) com schemas zod (`pasta` no enum de `PASTAS`, `titulo` de 1 a 120, `descricao` de 1 a 600, `data_documento` em `AAAA-MM-DD` ou null, `confirmado` booleano) e capacidade `documentos` em `CAPACIDADE`, exceto `enviar_documento`, que usa `podeVerDocumento`; `guardar_documento` usa `extras.anexoId` ou `ultimoPendente(ctx.membro)` (depende de T040, T048)
- [X] T050 [US2] Em `src/tools.ts`, `registrar_transacao`: com `extras.anexoId` pendente e transacao criada, guardar o anexo ligado a ela em `comprovantes` (forma de pagamento com "pix" ou "transfer") ou `notas_fiscais` (resto), titulo `<descricao> - <contraparte>` (sem contraparte, so a descricao), e acrescentar "Comprovante guardado (#id)." a resposta; vale tambem para quem nao tem `documentos` (R18) (depende de T049)
- [X] T051 [US2] Em `src/prompt.ts`, acrescentar as regras de [contracts/ferramentas-documentos.md](contracts/ferramentas-documentos.md#prompt): arquivo sem pedido, dizer o que parece e perguntar se guarda; com pedido, `guardar_documento` com descricao rica; pedido de documento, `buscar_documentos` e depois `enviar_documento` ou lista de ate 5; nunca inventar id (depende de T049)
- [X] T052 [P] [US2] Em `src/scheduler.ts`, chamar `documentos(repo.db).limparPendentes(now)` no `tick`, no maximo uma vez por hora (depende de T039)
- [X] T053 [P] [US2] Em `src/cli.ts`, passar `enviarArquivo` que imprime `[arquivo enviado] <titulo>: <caminho absoluto>` (depende de T048)

**API do painel**

- [X] T054 [US2] Em `src/api.ts`, acrescentar a `CAPACIDADE_ROTA` as rotas de [contracts/api-documentos.md](contracts/api-documentos.md) e implementar `GET /documentos` (pastas, documentos, uso, total; query `pasta`, `busca`, `pagina`), `PATCH /documentos/:id` (zod: `titulo` 1 a 120, `pasta` no enum, `descricao` ate 600), `DELETE /documentos/:id` e `GET /documentos/:id/arquivo` (sem capacidade na rota; `podeVerDocumento` decide; `404` quando nao pode; `Content-Type` original e `Content-Disposition: inline; filename*=UTF-8''<titulo>.<ext>`) (depende de T040)
- [X] T055 [US2] Em `src/api.ts`, `GET /transacoes` acrescenta `comprovanteId` (id do documento guardado e visivel ligado a transacao, ou null), em uma consulta para o mes inteiro, nao uma por transacao (depende de T054)

**Painel web**

- [X] T056 [P] [US2] Em `web/src/api.ts`, tipos `Pasta`, `Documento`, `Documentos` (resposta de `GET /documentos`) e `comprovanteId?: number | null` em `Transacao`; funcao `abrirArquivo(id)` que faz `fetch` com o token da sessao, cria `URL.createObjectURL(blob)`, abre numa nova aba e revoga a URL depois de 60 s (depende de T054)
- [X] T057 [US2] Em `web/src/mesas.ts`, cargo do Davi passa a "Projetos e documentos" e a mesa de Tarefas exige `["tarefas", "documentos"]`; em `web/src/router.ts`, rota `/tarefas/documentos` com `meta: { mesa: "tarefas" }` (depende de T056)
- [X] T058 [US2] Criar `web/src/views/tarefas/DocumentosView.vue` no padrao de `web/src/views/operacao/AcessosView.vue`: cabecalho com voltar para `/tarefas`, barra de uso (vira aviso a partir de 80%), lista de pastas com quantidade como filtro, campo de busca, lista de documentos (titulo, descricao em uma linha, pasta, data, quem enviou), abrir com `abrirArquivo`, e `PainelLateral` para renomear, mover (select com `PASTAS`), editar descricao e excluir com confirmacao; `EstadoVazio` explicando "mande um PDF ou foto pelo WhatsApp e diga guarda esse"; `StatusCarga` (depende de T057)
- [X] T059 [P] [US2] Em `web/src/views/TarefasMesa.vue`, atalho "Documentos →" para `/tarefas/documentos`, visivel so com `pode("documentos")` (depende de T057)
- [X] T060 [P] [US2] Em `web/src/views/financas/TransacoesView.vue`, quando `t.comprovanteId`, mostrar o chip "comprovante" na linha e o botao "Ver comprovante" no `PainelLateral` de edicao, ambos chamando `abrirArquivo` (depende de T056)

**Checkpoint**: US2 completa; T041 a T044 verdes; roteiro de [quickstart.md](quickstart.md#us2-documentos) passando.

---

## Phase 8: Polish (US2)

- [X] T061 [P] Em `src/seed.ts`, guardar na conta demo 6 documentos de exemplo gerados no proprio seed (PDFs minimos de uma pagina escritos a mao, sem biblioteca, e uma imagem PNG pequena): "Contrato de aluguel do apartamento" (contratos, 2026-03-12), "Boleto do condominio" (boletos), "CRLV do carro" (carro), "Nota fiscal do notebook" (notas_fiscais, ligada a parcela do Notebook), "Receita do dentista" (saude) e "Comprovante do aluguel" (comprovantes, ligado ao Aluguel do mes); apagar antes `data/demo-arquivos/<telefone demo>`
- [X] T062 [P] Em `README.md`, documentar a guarda de documentos (WhatsApp e painel), pastas, limites (20 MB, 1 GB, aviso em 80%, so PDF e imagem lidos pela IA), pendentes apagados em 24 h, a pasta `data/<banco>-arquivos/` e o que ficou de fora (enviar pelo painel, pastas proprias, ler DOCX); tabela "Como esta organizado" com `src/documentos.ts`
- [X] T063 Rodar `npm run typecheck`, `npm test` e `npx vue-tsc --noEmit` em `web/` e corrigir o que falhar
- [ ] T064 Executar o roteiro de [quickstart.md](quickstart.md#us2-documentos) (painel demo, terminal com `DB_PATH=data/demo.db` e, se houver numero de teste, WhatsApp), com `AI_PROVIDER=gemini` e com `AI_PROVIDER=claude` quando houver `ANTHROPIC_API_KEY`
  - 2026-10-27: painel conferido como titular (pastas, busca "apartamento marco", download do PDF, `comprovanteId` em Transacoes). Terminal com Gemini nao validado: o Gemini respondeu 503 de alta demanda (principal e reserva), inclusive em pedidos so com ferramentas antigas. Falta repetir o terminal, o WhatsApp e o Claude.
  - 2026-10-27, depois: terminal com Gemini ok ("acha o contrato do apartamento" e "me manda o comprovante do aluguel" enviam o arquivo; "documento do barco" diz que nao achou). Falta o WhatsApp com numero de teste e o Claude.

---

## Phase 9: Setup (US3)

**Purpose**: arquivo de testes. Decisoes em [research.md](research.md) R23 a R34; tabelas em
[data-model.md](data-model.md#us3-avisos-proativos).

- [X] T065 Criar `test/avisos.test.ts` com o mesmo cabecalho de `test/documentos.test.ts` (variaveis de ambiente, `openDb(":memory:")`, helper `contaCom`, um `now` fixo com `fromLocal`) e incluir o arquivo no script `test` de `package.json` depois de `test/documentos.test.ts`

---

## Phase 10: Foundational (US3)

**Purpose**: tabelas, preferencias, registro de envio e fila de pendentes. Bloqueia a Phase 11.

- [X] T066 Criar `src/avisos.ts` com `prepararTabelasAvisos(db)` (chamada no fim de `openDb` em `src/db.ts`), criando exatamente as tabelas de [data-model.md](data-model.md#us3-avisos-proativos): `bills` (`description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 80)`, `amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents > 0)`, `category TEXT NOT NULL DEFAULT 'Contas'`, `due_on TEXT NOT NULL`, `due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31)`, `status TEXT NOT NULL CHECK (status IN ('aberta','paga','cancelada'))`), `recurring` (`kind` em `despesa|receita`, `amount_cents > 0`, `description` de 1 a 80, `frequency` em `diaria|semanal|mensal`, `anchor_day` de 0 a 31 ou NULL, `status` em `ativa|pausada|cancelada`), `notice_prefs` (PK `(phone, kind)`, `kind` em `vencimentos|categoria|recorrentes|resumo_manha|resumo_noite`, `enabled` 0 ou 1, `hour` de 0 a 23), `notice_log` (PK `(phone, kind, key)`) e `pending_notices`; em `src/db.ts`, acrescentar ao laco de colunas `transactions.recurring_id INTEGER` e `transactions.bill_id INTEGER`, e o indice `CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_recorrencia ON transactions (recurring_id, occurred_on) WHERE recurring_id IS NOT NULL`
- [X] T067 Em `src/avisos.ts`, preferencias: `TIPOS_AVISO` com nome e descricao de cada tipo; padroes de R28 (titular: `vencimentos`, `categoria`, `recorrentes` e `resumo_manha` ligados, `resumo_noite` desligado; membro: tudo desligado; horas 9, 9, 9, `config.dailySummaryHour` e 21); `preferencias(db, ctx)` devolvendo os cinco tipos com `ligado`, `hora` e `disponivel` (categoria, vencimentos e recorrentes exigem `despesas` ou, em recorrentes, `receitas`); `definirPreferencia(db, phone, tipo, { ligado, hora? })` com `INSERT ... ON CONFLICT DO UPDATE` (depende de T066)
- [X] T068 Em `src/avisos.ts`, registro e fila: `marcarEnvio(db, phone, tipo, chave)` com `INSERT OR IGNORE` devolvendo `true` so na primeira vez (R30); `enfileirar(db, phone, texto)`; `retirarPendentes(db, phone, agora)` que devolve os textos com ate 7 dias, marca `delivered_at` e apaga os mais velhos; `limparRegistros(db, agora)` que apaga `notice_log` com mais de 90 dias (depende de T066)
- [X] T069 Em `src/avisos.ts`, `entregar(db, send, phone, tipo, chave, texto)`: se `marcarEnvio` devolver `false`, nao faz nada; senao chama `send`; se `send` lancar erro, guarda o texto com `enfileirar` e registra o erro com `console.error`, sem relancar (R29) (depende de T068)
- [X] T070 Em `test/avisos.test.ts`, testar a fundacao: padroes de preferencia para titular e membro e `disponivel` por perfil; `definirPreferencia` muda e persiste; `marcarEnvio` so devolve `true` uma vez por chave; `entregar` com `send` que falha deixa o texto pendente e `retirarPendentes` devolve e marca entregue; pendente com 8 dias e descartado (depende de T065, T069)

**Checkpoint**: infraestrutura de avisos pronta; agendador ainda igual.

---

## Phase 11: User Story 3 - Avisos proativos de financas (Priority: P3)

**Goal**: o assessor avisa sem esperar pergunta: vencimento na vespera, categoria acima do mes
anterior com projecao, lancamento recorrente feito sozinho, resumo da noite; comparativo sob
pedido; cada tipo ligado ou desligado por pessoa.

**Independent Test**: cadastrar uma conta com vencimento amanha e uma despesa recorrente semanal,
avancar o relogio de teste e verificar que o aviso e o lancamento automatico acontecem uma vez so
(spec, US3).

### Tests for User Story 3

> Escrever antes da implementacao correspondente e ver falhar.

- [X] T071 [US3] Em `test/avisos.test.ts`, testar contas a pagar e recorrencias no dominio: criar conta unica e mensal; pagar unica vira `paga` e cria despesa com `bill_id`; pagar mensal com vencimento em 31/01 avanca para o ultimo dia de fevereiro e depois volta ao dia 31 em marco; pagar sem valor cadastrado nem informado recusa; recorrencia semanal criada numa segunda lanca toda segunda; `lancarDevidas` duas vezes no mesmo dia cria uma transacao so; pausada nao lanca; retomar recalcula `next_on` a partir de hoje; parado por 10 dias lanca so as ocorrencias dos ultimos 7
- [X] T072 [US3] Em `test/avisos.test.ts`, testar categoria, comparativo e resumo: Mercado com R$ 300 no mes anterior ate o dia 10 e R$ 360 neste mes ate o dia 10 avisa com 20% e a projecao; R$ 330 (10%) nao avisa; diferenca abaixo de R$ 50 ou mes anterior abaixo de R$ 100 nao avisa; `comparar_meses` traz total, diferenca e as 3 maiores variacoes; resumo da noite conta gastos, lembretes, tarefas e documentos do dia e omite areas fora do perfil; dia sem registro devolve `null`
- [X] T073 [US3] Em `test/avisos.test.ts`, testar o agendador com `now` injetado: conta que vence amanha avisa uma vez na hora configurada e nao repete no tick seguinte nem depois de paga; o aviso de categoria nao sai duas vezes na mesma semana ISO; `recorrentes` desligado lanca a transacao sem avisar; membro com tudo desligado nao recebe nada; lembrete com `send` que falha avanca e fica pendente (nao e reenviado no proximo tick); webhook com pendentes manda "Avisos que ficaram para depois:" antes da resposta do assessor (fetch simulado como em `test/conta.test.ts`)
- [X] T074 [US3] Em `test/avisos.test.ts`, testar as 9 ferramentas e a matriz de perfis: titular e completo usam todas; so gastos usa contas a pagar, recorrencia de despesa, `comparar_meses` e `configurar_avisos`, e recebe `Sem permissao` em recorrencia de receita; agenda e tarefas recebe `Sem permissao` em tudo, exceto `configurar_avisos`, que responde que o tipo nao se aplica para `categoria`
- [X] T075 [US3] Em `test/avisos.test.ts`, testar a API de [contracts/api-avisos.md](contracts/api-avisos.md): criar, listar, pagar e cancelar conta; `400` ao pagar sem valor; criar, pausar e cancelar recorrencia; `403` para recorrencia de receita como so gastos; `GET /api/avisos` com `disponivel` e `modeloAprovado`; `PUT /api/avisos/categoria` muda so a preferencia de quem esta logado; `recorrente` e `contaPagarId` em `/api/transacoes`; `contasProximas` em `/api/financas`

### Implementation for User Story 3

**Dominio**

- [X] T076 [US3] Em `src/avisos.ts`, contas a pagar: `criarConta(db, ctx, { descricao, vencimento, valor?, categoria?, mensal })` (`due_day` = dia de `vencimento` quando mensal), `listarContas(db, conta, { incluirPagas })` ordenada por `due_on` com `vencida` calculada, `pagarConta(repo, ctx, id, { valor?, data?, pagamento? })` que registra a despesa com `bill_id` e `created_by`, e na mensal avanca `due_on` para o mes seguinte usando `due_day` (31 vira o ultimo dia do mes), `cancelarConta`, `contasAVencer(db, conta, de, ate)` (depende de T066)
- [X] T077 [US3] Em `src/avisos.ts`, recorrencias: `criarRecorrencia(db, ctx, {...})` com `anchor_day` vindo de `inicio` (dia da semana na semanal, dia do mes na mensal) e `next_on = inicio`; `proximaData(rec, data)` (31 vira o ultimo dia do mes); `listarRecorrencias(db, conta)`; `alterarRecorrencia(db, id, acao, agora)` (retomar recalcula a partir de hoje); `lancarDevidas(repo, hoje)` que, para cada recorrencia `ativa` com `next_on <= hoje`, lanca as datas de no maximo 7 dias atras ate hoje com `recurring_id` (inserir com `INSERT OR IGNORE` pelo indice unico) e avanca `next_on`; devolve as transacoes criadas (depende de T066)
- [X] T078 [US3] Em `src/avisos.ts`, `categoriasAcima(repo, conta, hoje)` com as regras de R26 (pelo menos 15% acima, diferenca maior que R$ 50, mes anterior com pelo menos R$ 100, mesmo intervalo do mes anterior com dia 31 virando o ultimo dia, projecao `gasto / dias passados * dias do mes`) e `compararMeses(repo, conta, mes, hoje)` de R31 (depende de T066)
- [X] T079 [US3] Em `src/avisos.ts`, os textos de [contracts/ferramentas-avisos.md](contracts/ferramentas-avisos.md#textos-dos-avisos): `textoVencimento`, `textoCategoria`, `textoRecorrente`, `resumoManha(repo, ctx, now)` (o resumo atual de `buildDailySummary` mais os vencimentos do dia) e `resumoNoite(repo, ctx, now)` (contagens so das areas do perfil; `null` sem registro) (depende de T076, T078)

**Agendador e webhook**

- [X] T080 [US3] Em `src/scheduler.ts`, `rodarAvisos(repo, send, now)`: lanca as recorrencias devidas uma vez por tick e avisa quem tem `recorrentes` ligado (chave `recorrente:<id>:<data>`); para cada pessoa em `users`, resolve o contexto e, para cada tipo ligado e disponivel cuja hora ja chegou hoje, monta e entrega pela `entregar` com as chaves de R30 (vencimentos de amanha, categorias acima, resumos); trocar `runSummaryOnce` por `rodarAvisos` e manter `buildDailySummary` exportado para os testes existentes; em `runRemindersOnce`, envio que falha vai para `enfileirar` e o lembrete avanca; chamar `limparRegistros` junto da limpeza de documentos (depende de T069, T077, T079)
- [X] T081 [US3] Em `src/server.ts`, antes de `sendText(msg.from, answer)`, chamar `retirarPendentes(repo.db, msg.from, new Date())` e, se houver, mandar um texto unico `Avisos que ficaram para depois:\n- ...` (depende de T068)

**Assessor**

- [X] T082 [US3] Em `src/tools.ts`, as 9 ferramentas de [contracts/ferramentas-avisos.md](contracts/ferramentas-avisos.md) com schemas zod (`descricao` de 1 a 80, `valor` positivo, datas `AAAA-MM-DD`, `frequencia` em `diaria|semanal|mensal`, `acao` em `pausar|retomar|cancelar`, `tipo` de aviso no enum, `hora` de 0 a 23) e capacidade em `CAPACIDADE` (`despesas` para contas e `comparar_meses`; recorrencias conferem o tipo com `exigir`; `configurar_avisos` sem capacidade, gravando para `ctx.membro`) (depende de T067, T076, T077, T078)
- [X] T083 [US3] Em `src/prompt.ts`, as regras de [contracts/ferramentas-avisos.md](contracts/ferramentas-avisos.md#prompt): "paguei X" com conta cadastrada usa `pagar_conta`; frase de recorrencia usa `criar_recorrencia`; ligar, desligar e mudar hora de aviso usa `configurar_avisos` (depende de T082)

**API do painel**

- [X] T084 [US3] Em `src/api.ts`, rotas de contas a pagar de [contracts/api-avisos.md](contracts/api-avisos.md#contas-a-pagar-capacidade-despesas) com zod e entradas `["despesas"]` em `CAPACIDADE_ROTA` (depende de T076)
- [X] T085 [US3] Em `src/api.ts`, rotas de recorrencias com entradas `["despesas", "receitas"]` em `CAPACIDADE_ROTA` e conferencia do tipo (`403` com `SEM_ACESSO`); `GET` so com os tipos visiveis (depende de T077)
- [X] T086 [US3] Em `src/api.ts`, `GET /api/avisos` e `PUT /api/avisos/:tipo` para `ctx.membro`, com `disponivel` e `modeloAprovado` (`Boolean(config.whatsapp.noticeTemplate)`) (depende de T067)
- [X] T087 [US3] Em `src/api.ts`, `recorrente` e `contaPagarId` em cada item de `GET /api/transacoes` e `contasProximas` (ate 5 contas abertas que vencem nos proximos 7 dias) em `GET /api/financas` (depende de T076)

**Painel web**

- [X] T088 [P] [US3] Em `web/src/api.ts`, tipos `ContaPagar`, `Recorrencia`, `Aviso`, `Avisos`; `recorrente?` e `contaPagarId?` em `Transacao`; `contasProximas?` em `Financas` (depende de T084 a T087)
- [X] T089 [US3] Em `web/src/mesas.ts`, item "Contas e recorrências" (`/financas/contas`, icone `repetir`) em `SUBMENU_FINANCAS`; em `web/src/router.ts`, rotas `/financas/contas` (mesa financas) e `/operacao/avisos` (mesa operacao) (depende de T088)
- [X] T090 [US3] Criar `web/src/views/financas/ContasView.vue` no padrao de `TransacoesView.vue` (com `CabecalhoSub`): bloco de contas a pagar (vencidas em destaque, proximas, pagas no mes), botao "Pagar" com `PainelLateral` para valor, data e forma; bloco de recorrencias com frequencia em palavras e proxima data, pausar, retomar e cancelar; formularios de nova conta e nova recorrencia; recorrencia de receita so com `pode("receitas")` (depende de T089)
- [X] T091 [P] [US3] Criar `web/src/views/operacao/AvisosView.vue` no padrao de `AcessosView.vue`: um item por tipo com nome, descricao, interruptor e seletor de hora; tipos indisponiveis aparecem desabilitados com o motivo; sem `modeloAprovado`, aviso "Sem modelo aprovado na Meta, os avisos so chegam se você falou com o assessor nas últimas 24 horas" (depende de T089)
- [X] T092 [P] [US3] Em `web/src/views/financas/FinancasPainel.vue`, bloco "Vence nos próximos dias" com `contasProximas` (descricao, data, valor ou "valor variável") e link para `/financas/contas`; nao aparece sem contas (depende de T088)
- [X] T093 [P] [US3] Em `web/src/views/OperacaoMesa.vue`, atalho "Avisos →" para `/operacao/avisos` ao lado de "Equipe e acesso"; em `web/src/views/financas/TransacoesView.vue`, chip "recorrente" quando `t.recorrente` (depende de T089)

**Checkpoint**: US3 completa; T070 a T075 verdes; roteiro de [quickstart.md](quickstart.md#us3-avisos-proativos) passando.

---

## Phase 12: Polish (US3)

- [X] T094 [P] Em `src/seed.ts`, criar na conta demo as contas a pagar "Condomínio" (mensal, dia 8, R$ 480), "Fatura Nubank" (mensal, dia 15, valor variável) e "IPVA" (única, daqui a 20 dias, R$ 1.240) e as recorrencias "Academia" (semanal, segunda, R$ 89,90) e "Streaming" (mensal, dia 18, R$ 55,90); ligar `resumo_noite` para o titular demo
- [X] T095 [P] Em `README.md`, documentar contas a pagar, recorrencias, tipos de aviso com padroes e horarios, a fila de avisos pendentes e a dependencia do modelo aprovado fora da janela de 24 horas; tabela "Como esta organizado" com `src/avisos.ts`
- [X] T096 Rodar `npm run typecheck`, `npm test` e `npx vue-tsc --noEmit` em `web/` e corrigir o que falhar
- [ ] T097 Executar o roteiro de [quickstart.md](quickstart.md#us3-avisos-proativos) (painel demo como titular e como Bia, terminal com `DB_PATH=data/demo.db`), com `AI_PROVIDER=gemini` e com `AI_PROVIDER=claude` quando houver `ANTHROPIC_API_KEY`
  - 2026-10-27: painel como titular ok (contas, pagamento de fatura variavel com recusa sem valor, recorrencias, Avisos com alerta de modelo nao aprovado). Terminal com Gemini ok (comparativo, recorrencia "toda sexta", desligar aviso de categoria). Falta o agendador com numero real de WhatsApp e o Claude.

---

## Phase 13: Setup (US4)

**Purpose**: arquivo de testes e configuracao. Decisoes em [research.md](research.md) R35 a R46;
tabelas em [data-model.md](data-model.md#us4-google-agenda).

- [ ] T098 Criar `test/google.test.ts` com o mesmo cabecalho de `test/avisos.test.ts`, mais `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (32 bytes aleatorios em base64) e `PAINEL_URL=http://localhost:3001` definidos antes dos imports, e um helper `googleFalso()` que troca `globalThis.fetch` por um roteador dos endpoints do Google (`oauth2.googleapis.com/token`, `/revoke`, `www.googleapis.com/calendar/v3/calendars/primary/events`) registrando as chamadas; incluir o arquivo no script `test` de `package.json` depois de `test/avisos.test.ts`
- [ ] T099 [P] Em `src/config.ts`, bloco `google: { clientId, clientSecret, tokenKey, painelUrl }` lido de `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (base64 que precisa dar exatamente 32 bytes; senao `null`) e `PAINEL_URL` (sem barra no fim), e `googleConfigurado()` verdadeiro so com os quatro; em `.env.example`, as quatro variaveis com comentario curto e o comando para gerar a chave

---

## Phase 14: Foundational (US4)

**Purpose**: tabelas, cifra do token e fluxo de autorizacao. Bloqueia a Phase 15.

- [ ] T100 Criar `src/google.ts` com `prepararTabelasGoogle(db)` (chamada no fim de `openDb` em `src/db.ts`): `google_accounts` (`phone TEXT PRIMARY KEY`, `email TEXT`, `refresh_token_enc TEXT NOT NULL`, `scope TEXT NOT NULL`, `status TEXT NOT NULL CHECK (status IN ('conectada','expirada'))`, `connected_at TEXT NOT NULL`, `last_error TEXT`) e `google_auth` (`token_hash TEXT PRIMARY KEY`, `kind TEXT NOT NULL CHECK (kind IN ('state','link'))`, `phone TEXT NOT NULL`, `expires_at TEXT NOT NULL`, `used_at TEXT`); em `src/db.ts`, acrescentar `reminders.google_event_id TEXT` ao laco de colunas, o campo na interface `Reminder` e em `addReminder` (parametro `quem` ganha `google_event_id?`), e os metodos `remindersDoEvento(phone, eventId)` e `moverLembreteDoEvento(phone, eventId, novoHorario)` (depende de T099)
- [ ] T101 Em `src/google.ts`, `cifrar(texto)` e `decifrar(valor)` com AES-256-GCM, IV de 12 bytes aleatorio por chamada e formato `iv.tag.cifrado` em base64url, usando `config.google.tokenKey`; sem chave, erro `Google Agenda nao configurada neste servidor.` (depende de T100)
- [ ] T102 Em `src/google.ts`, o fluxo de R37: `criarLink(db, phone)` (token aleatorio de 32 bytes, guardado como SHA-256, `kind = 'link'`, 15 min; devolve `<PAINEL_URL>/api/google/conectar/<token>`); `usarLink(db, token)` (uso unico, dentro da validade; devolve o telefone ou `null`); `urlDeAutorizacao(db, phone)` (cria `state` de 10 min e monta a URL de `accounts.google.com/o/oauth2/v2/auth` com `client_id`, `redirect_uri=<PAINEL_URL>/api/google/retorno`, `response_type=code`, `scope="openid email https://www.googleapis.com/auth/calendar.events"`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` e `state`); `concluirConexao(db, code, state)` (consome o `state` uma vez, troca o `code` em `oauth2.googleapis.com/token`, recusa se `scope` nao trouxer `calendar.events`, le o e-mail do payload do `id_token`, grava `refresh_token` cifrado com `status = 'conectada'` e devolve o telefone) (depende de T101)
- [ ] T103 Em `src/google.ts`, `accessToken(db, phone)` com cache em memoria (renova so quando faltar menos de 60 s), classes `GoogleNaoConectado`, `GoogleExpirado` (resposta `invalid_grant`; marca `status = 'expirada'` e grava `last_error`) e `GoogleIndisponivel` (rede, tempo limite de 10 s ou 5xx); `estado(db, phone)` para o painel; `desconectar(db, phone)` que chama `oauth2.googleapis.com/revoke` (falha do revoke nao impede) e apaga a linha e o cache; `limparAutorizacoes(db, agora)` que apaga `google_auth` vencidos ha mais de 1 dia (depende de T102)
- [ ] T104 Em `test/google.test.ts`, testar a fundacao: o banco nunca contem o refresh token em claro; outra `GOOGLE_TOKEN_KEY` nao decifra; link e `state` de uso unico e com validade; `concluirConexao` com `state` vencido, repetido ou inexistente nao grava nada; escopo sem `calendar.events` e recusado; access token reaproveitado ate faltar 60 s e renovado depois; `invalid_grant` marca `expirada`; `desconectar` chama o revoke e apaga (depende de T098, T103)

**Checkpoint**: conexao com o Google testada; nada exposto ao assessor ou ao painel ainda.

---

## Phase 15: User Story 4 - Google Agenda pelo WhatsApp (Priority: P4)

**Goal**: a pessoa conecta a propria conta Google e a Lia cria, consulta, remarca e cancela
compromissos no calendario principal pelo WhatsApp, com convidados, Meet, aviso de conflito e o
lembrete do WhatsApp ligado; o resumo da manha traz os compromissos do dia.

**Independent Test**: conectar uma conta Google de teste, pedir "reuniao com a Ana terca 10h com
link" e conferir o evento no Google Agenda com convidado e link de videochamada (spec, US4).

### Tests for User Story 4

> Escrever antes da implementacao correspondente e ver falhar.

- [ ] T105 [US4] Em `test/google.test.ts`, testar eventos com o Google simulado: `criarEvento` com 60 min por padrao, `timeZone` igual a `TIMEZONE`, `attendees` e `sendUpdates=all` quando ha convidados, `conferenceData.createRequest` com `hangoutsMeet` e `conferenceDataVersion=1` quando pedido; conflito detectado pela listagem do intervalo; lembrete interno criado com `google_event_id` e `lembrar_minutos_antes`; `moverEvento` faz `PATCH` e move o lembrete; `apagarEvento` faz `DELETE` e cancela o lembrete
- [ ] T106 [US4] Em `test/google.test.ts`, testar as 6 ferramentas: `criar_compromisso` cria e responde com dia, hora e quando lembra; com conflito e sem `confirmar_conflito`, nao cria e descreve o conflito; sem conta conectada, cria so o lembrete interno e devolve o link; sem configuracao no servidor, diz que nao esta disponivel e cria o lembrete interno; com `invalid_grant`, marca `expirada`, cria o lembrete interno e devolve o link de reconexao; `consultar_agenda`, `remarcar_compromisso`, `cancelar_compromisso` (pede confirmacao) e `desconectar_google_agenda` (pede confirmacao); so gastos recebe `Sem permissao`; a conta Google do titular nao e usada quando a Bia (completo) pede
- [ ] T107 [US4] Em `test/google.test.ts`, testar API e resumo: `GET /api/google` com `configurado`, `conectada` e `email`; `POST /api/google/conectar` devolve a URL do Google com `state`; `GET /api/google/conectar/:token` responde `302` para o Google e, repetido, a pagina de link vencido; `GET /api/google/retorno` grava e responde a pagina de sucesso, e com `error=access_denied` nao grava; `DELETE /api/google` revoga e apaga; `GET /api/agenda` traz `google.eventos` do dia; resumo da manha lista os eventos do dia e, com o Google fora, sai com "Nao consegui ler o Google Agenda agora"

### Implementation for User Story 4

**Google e assessor**

- [ ] T108 [US4] Em `src/google.ts`, eventos de R39 a R42 com o tipo `Evento` de [contracts/api-google.md](contracts/api-google.md#evento): `listarEventos(db, phone, de, ate, busca?)` (`singleEvents=true`, `orderBy=startTime`, `q` com a busca), `conflitos(db, phone, inicio, fim)`, `criarEvento(db, phone, { titulo, inicio, duracaoMin, convidados, comVideo })`, `moverEvento(db, phone, id, inicio, duracaoMin?)` (`PATCH` com `sendUpdates=all`), `apagarEvento(db, phone, id)` (`sendUpdates=all`); horarios montados com `fromLocal` e enviados com `timeZone: config.timezone` (depende de T103)
- [ ] T109 [US4] Em `src/prompt.ts`, `ToolExecutor` passa a devolver `string | Promise<string>`; em `src/providers/gemini.ts` e `src/providers/claude.ts`, aguardar (`await`) o resultado de `execute`; em `src/tools.ts`, `executeTool` passa a devolver `string | Promise<string>` e trata `SemPermissao` e `AuthError` tambem quando a promessa rejeita; as ferramentas atuais continuam sincronas e os testes existentes seguem iguais (depende de T108)
- [ ] T110 [US4] Em `src/tools.ts`, as 6 ferramentas de [contracts/ferramentas-agenda.md](contracts/ferramentas-agenda.md) com capacidade `agenda` em `CAPACIDADE` e schemas zod (`titulo` de 1 a 120, `inicio` em `AAAA-MM-DDTHH:mm`, `duracao_minutos` de 5 a 720, ate 20 `convidados` com `z.string().email()`, `lembrar_minutos_antes` de 0 a 1440, `confirmado` booleano); `criar_compromisso` cria o lembrete ligado e trata as falhas da tabela do contrato com o lembrete interno e o link; usa sempre a conta Google de `ctx.membro` (depende de T109)
- [ ] T111 [US4] Em `src/prompt.ts`, as regras de [contracts/ferramentas-agenda.md](contracts/ferramentas-agenda.md#prompt): compromisso com hora vai para `criar_compromisso`; sem data ou hora, perguntar; conflito, perguntar; mover ou cancelar so depois de `consultar_agenda`, sem inventar id (depende de T110)
- [ ] T112 [US4] Em `src/avisos.ts`, `resumoManha(repo, ctx, now, eventos?)` recebe `Evento[]` ou `"falhou"` e acrescenta "Compromissos de hoje: 09:00 Reuniao; 15:00 Dentista" ou "Nao consegui ler o Google Agenda agora"; em `src/scheduler.ts`, antes do resumo da manha, buscar os eventos do dia de quem tem conta `conectada` (falha vira `"falhou"`) e chamar `limparAutorizacoes` na limpeza horaria (depende de T108)

**API do painel**

- [ ] T113 [US4] Em `src/api.ts`, rotas privadas de [contracts/api-google.md](contracts/api-google.md#rotas-privadas-sessao-do-painel) (`GET /api/google`, `POST /api/google/conectar` com `503` sem configuracao, `DELETE /api/google`) com `["agenda"]` em `CAPACIDADE_ROTA`, sempre para `ctx.membro` (depende de T103)
- [ ] T114 [US4] Em `src/api.ts`, rotas publicas `GET /api/google/conectar/:token` e `GET /api/google/retorno` num plugin proprio com prefixo `/api/google`, registrado fora do plugin privado para nao passar pelo hook de sessao; respostas em HTML curto, sem dados da conta, conforme [contracts/api-google.md](contracts/api-google.md#rotas-publicas-fora-de-apiauth-sem-sessao) (depende de T102)
- [ ] T115 [US4] Em `src/api.ts`, `GET /api/agenda` ganha `google: { conectada, eventos, erro }` com os eventos do `dia` pedido de quem esta logado; falha do Google preenche `erro` sem derrubar a rota (depende de T108)

**Painel web**

- [ ] T116 [P] [US4] Em `web/src/api.ts`, tipos `GoogleStatus` e `Evento`, e `google?` em `Agenda` (depende de T113, T115)
- [ ] T117 [US4] Em `web/src/views/AgendaMesa.vue`, bloco "Google Agenda": sem configuracao, "Google Agenda não configurada neste servidor"; desconectada, botao "Conectar Google Agenda" que chama `POST /api/google/conectar` e vai para a URL devolvida; conectada, o e-mail e o botao "Desconectar" com confirmacao; expirada, aviso e botao "Reconectar"; no bloco do dia, os eventos do Google junto dos lembretes, com hora, titulo e link do Meet (depende de T116)

**Checkpoint**: US4 completa; T104 a T107 verdes; roteiro de [quickstart.md](quickstart.md#us4-google-agenda) passando.

---

## Phase 16: Polish (US4)

- [ ] T118 [P] Em `README.md`, secao Google Agenda: criar o projeto no Google Cloud, ativar a Calendar API, tela de consentimento em modo de teste com testadores, credencial do tipo "Aplicativo da Web" com o redirect `<PAINEL_URL>/api/google/retorno`, as quatro variaveis, o que funciona pelo WhatsApp e pelo painel, os limites do modo de teste (so testadores, acesso vence em 7 dias) e a verificacao exigida para uso aberto; tabela "Como esta organizado" com `src/google.ts`
- [ ] T119 Rodar `npm run typecheck`, `npm test` e `npx vue-tsc --noEmit` em `web/` e corrigir o que falhar
- [ ] T120 Executar o roteiro de [quickstart.md](quickstart.md#us4-google-agenda) com um projeto real no Google Cloud (depende de a pessoa criar o projeto e preencher o `.env`), com `AI_PROVIDER=gemini` e com `AI_PROVIDER=claude` quando houver `ANTHROPIC_API_KEY`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependencias
- **Foundational (Phase 2)**: depende do Setup; bloqueia a US1
- **US1 (Phase 3)**: depende da Phase 2
- **Polish (Phase 4)**: depende da US1
- **Setup US2 (Phase 5)**: sem dependencia de US1 alem do codigo ja na `main`
- **Foundational US2 (Phase 6)**: depende da Phase 5; bloqueia a US2
- **US2 (Phase 7)**: depende da Phase 6
- **Polish US2 (Phase 8)**: depende da US2
- **Setup US3 (Phase 9)**: sem dependencia alem do codigo ja na `main`
- **Foundational US3 (Phase 10)**: depende da Phase 9; bloqueia a US3
- **US3 (Phase 11)**: depende da Phase 10
- **Polish US3 (Phase 12)**: depende da US3
- **Setup US4 (Phase 13)**: sem dependencia alem do codigo ja na `main`
- **Foundational US4 (Phase 14)**: depende da Phase 13; bloqueia a US4
- **US4 (Phase 15)**: depende da Phase 14
- **Polish US4 (Phase 16)**: depende da US4; T120 depende tambem de um projeto no Google Cloud

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

### Dentro da US2

- Cadeia do dominio: T035 > T037 > T038 > T039 > T040 (T040 tambem depende de T036).
- Assessor: T039 > T048 > T049 (com T040) > T050 > T051; T048 > T053; T039 > T052.
- WhatsApp: T045 e T046 em paralelo; T047 depende delas e de T039.
- API: T040 > T054 > T055.
- Painel: T054 > T056 > T057 > T058 e T059; T056 > T060.
- Testes: T041 depois de T040; T042 antes de T049; T043 antes de T054; T044 antes de T047.

### Dentro da US3

- Fundacao: T066 > T067 e T068 > T069 > T070.
- Dominio: T066 > T076, T077 e T078 (independentes entre si, mesmo arquivo: sequenciais);
  T076 e T078 > T079.
- Agendador: T069, T077 e T079 > T080; T068 > T081.
- Assessor: T067, T076, T077 e T078 > T082 > T083.
- API: T076 > T084 e T087; T077 > T085; T067 > T086.
- Painel: T084 a T087 > T088 > T089 > T090, T091 e T093; T088 > T092.
- Testes: T071 antes de T076 e T077; T072 antes de T078 e T079; T073 antes de T080 e T081;
  T074 antes de T082; T075 antes de T084.

### Dentro da US4

- Fundacao: T099 > T100 > T101 > T102 > T103 > T104.
- Google e assessor: T103 > T108 > T109 > T110 > T111; T108 > T112.
- API: T103 > T113; T102 > T114; T108 > T115.
- Painel: T113 e T115 > T116 > T117.
- Testes: T105 antes de T108; T106 antes de T110; T107 antes de T112 a T115.

### Parallel Opportunities

- T002 e T003 em paralelo (arquivos diferentes).
- T008 a T011 tocam o mesmo arquivo (`test/conta.test.ts`): sequenciais.
- Depois de T024: T026, T028 em paralelo; T029 depois de T025.
- T030 e T031 em paralelo.
- US2: T035 e T036 em paralelo; T045 e T046 em paralelo entre si e com a Phase 6; T052 e T053
  depois de T039 e T048; no painel, T059 e T060 em paralelo depois de T057 e T056; T061 e T062
  em paralelo.
- T041 a T044 tocam o mesmo arquivo (`test/documentos.test.ts`): sequenciais.
- US3: o dominio inteiro fica em `src/avisos.ts` e a API em `src/api.ts`, por isso quase tudo e
  sequencial; no painel, T091, T092 e T093 em paralelo depois de T089; T094 e T095 em paralelo.
- T070 a T075 tocam o mesmo arquivo (`test/avisos.test.ts`): sequenciais.
- US4: T099 em paralelo com T098; T116 depois da API; T118 em paralelo com qualquer tarefa da
  Phase 15. O resto toca `src/google.ts`, `src/tools.ts` ou `src/api.ts` e e sequencial.
- T104 a T107 tocam o mesmo arquivo (`test/google.test.ts`): sequenciais.

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

## Parallel Example: User Story 2

```bash
# WhatsApp e provedores, arquivos diferentes, junto com a Phase 6:
Task: "Tipo document, uploadMedia e sendDocument em src/whatsapp.ts"
Task: "UserInput.document e PDF nos provedores em src/prompt.ts e src/providers/"

# Painel, depois de T056 e T057:
Task: "Atalho Documentos em web/src/views/TarefasMesa.vue"
Task: "Ver comprovante em web/src/views/financas/TransacoesView.vue"
```

## Parallel Example: User Story 3

```bash
# Painel, depois de T089:
Task: "Criar web/src/views/operacao/AvisosView.vue"
Task: "Bloco Vence nos proximos dias em web/src/views/financas/FinancasPainel.vue"
Task: "Atalho Avisos em OperacaoMesa.vue e chip recorrente em TransacoesView.vue"
```

## Parallel Example: User Story 4

```bash
# Setup, arquivos diferentes:
Task: "Criar test/google.test.ts com o Google simulado"
Task: "Bloco google em src/config.ts e variaveis em .env.example"

# Durante a Phase 15:
Task: "Secao Google Agenda no README.md"
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

### US2

1. Phases 5 e 6: modulo de documentos testado, sem mudar comportamento.
2. Assessor e WhatsApp (T045 a T053): ja entrega guardar, buscar e devolver pela conversa, e o
   comprovante automatico do cupom.
3. API e painel (T054 a T060).
4. **Parar e validar** com a [secao US2 do quickstart](quickstart.md#us2-documentos).
5. Commits por bloco, na branch `001-us2-documentos`.

### US3

1. Phases 9 e 10: preferencias, registro e fila testados, sem mudar o agendador.
2. Dominio e agendador (T076 a T081): ja entrega os avisos pelo WhatsApp e corrige o reenvio
   infinito de lembretes, sem painel.
3. Assessor (T082, T083): contas, recorrencias, comparativo e preferencias pela conversa.
4. API e painel (T084 a T093).
5. **Parar e validar** com a [secao US3 do quickstart](quickstart.md#us3-avisos-proativos).
6. Commits por bloco, na branch `001-us3-avisos`.

### US4

1. Phases 13 e 14: cifra e fluxo de autorizacao testados com o Google simulado.
2. Google e assessor (T108 a T112): ja entrega compromissos pelo WhatsApp e o resumo com os
   eventos; a conexao pode ser feita pelo link que o assessor manda.
3. API e painel (T113 a T117).
4. **Parar e validar** com a [secao US4 do quickstart](quickstart.md#us4-google-agenda), que
   precisa de um projeto real no Google Cloud.
5. Commits por bloco, na branch `001-us4-google-agenda`.

---

## Notes

- [P] = arquivos diferentes, sem dependencia aberta.
- Comentarios no codigo: so o porque, curtos, sem historico.
- Fora desta lista: transferencia de titularidade, exclusao de conta, entrar por WhatsApp,
  perfil contador (US7) e resumo por membro (US3).
- Fora da US2: enviar arquivo pelo painel, pastas criadas pelo usuario, ler DOCX e XLSX,
  armazenamento externo.
- Fora da US3: fatura lida do banco (US8), avisos por e-mail ou push, alerta por valor definido
  pela pessoa.
- Fora da US4: Outlook e iCloud, agendas secundarias do Google, aceitar ou recusar convites
  recebidos, sincronizar lembretes antigos, pagina publica de agendamento (US5).
