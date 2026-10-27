---

description: "Tarefas da feature 001: US1 (conta compartilhada, concluida) e US2 (documentos)"
---

# Tasks: Paridade com o Meu Assessor (US1 e US2)

**Input**: Design documents from `/specs/001-paridade-meu-assessor/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: incluidos. A constituicao (Fluxo de Desenvolvimento) exige teste para regra de dominio
nova, e isolamento por usuario e o principio I.

**Escopo**: fases 1 a 4 sao da US1 (T001 a T033, na `main` pelo PR #1). Fases 5 a 8 sao da US2
(T034 em diante). As historias 3 a 9 entram aqui depois dos proprios planos.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependencia de tarefa aberta)
- **[Story]**: historia da spec (US1 ou US2)
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

- [ ] T056 [P] [US2] Em `web/src/api.ts`, tipos `Pasta`, `Documento`, `Documentos` (resposta de `GET /documentos`) e `comprovanteId?: number | null` em `Transacao`; funcao `abrirArquivo(id)` que faz `fetch` com o token da sessao, cria `URL.createObjectURL(blob)`, abre numa nova aba e revoga a URL depois de 60 s (depende de T054)
- [ ] T057 [US2] Em `web/src/mesas.ts`, cargo do Davi passa a "Projetos e documentos" e a mesa de Tarefas exige `["tarefas", "documentos"]`; em `web/src/router.ts`, rota `/tarefas/documentos` com `meta: { mesa: "tarefas" }` (depende de T056)
- [ ] T058 [US2] Criar `web/src/views/tarefas/DocumentosView.vue` no padrao de `web/src/views/operacao/AcessosView.vue`: cabecalho com voltar para `/tarefas`, barra de uso (vira aviso a partir de 80%), lista de pastas com quantidade como filtro, campo de busca, lista de documentos (titulo, descricao em uma linha, pasta, data, quem enviou), abrir com `abrirArquivo`, e `PainelLateral` para renomear, mover (select com `PASTAS`), editar descricao e excluir com confirmacao; `EstadoVazio` explicando "mande um PDF ou foto pelo WhatsApp e diga guarda esse"; `StatusCarga` (depende de T057)
- [ ] T059 [P] [US2] Em `web/src/views/TarefasMesa.vue`, atalho "Documentos →" para `/tarefas/documentos`, visivel so com `pode("documentos")` (depende de T057)
- [ ] T060 [P] [US2] Em `web/src/views/financas/TransacoesView.vue`, quando `t.comprovanteId`, mostrar o chip "comprovante" na linha e o botao "Ver comprovante" no `PainelLateral` de edicao, ambos chamando `abrirArquivo` (depende de T056)

**Checkpoint**: US2 completa; T041 a T044 verdes; roteiro de [quickstart.md](quickstart.md#us2-documentos) passando.

---

## Phase 8: Polish (US2)

- [ ] T061 [P] Em `src/seed.ts`, guardar na conta demo 6 documentos de exemplo gerados no proprio seed (PDFs minimos de uma pagina escritos a mao, sem biblioteca, e uma imagem PNG pequena): "Contrato de aluguel do apartamento" (contratos, 2026-03-12), "Boleto do condominio" (boletos), "CRLV do carro" (carro), "Nota fiscal do notebook" (notas_fiscais, ligada a parcela do Notebook), "Receita do dentista" (saude) e "Comprovante do aluguel" (comprovantes, ligado ao Aluguel do mes); apagar antes `data/demo-arquivos/<telefone demo>`
- [ ] T062 [P] Em `README.md`, documentar a guarda de documentos (WhatsApp e painel), pastas, limites (20 MB, 1 GB, aviso em 80%, so PDF e imagem lidos pela IA), pendentes apagados em 24 h, a pasta `data/<banco>-arquivos/` e o que ficou de fora (enviar pelo painel, pastas proprias, ler DOCX); tabela "Como esta organizado" com `src/documentos.ts`
- [ ] T063 Rodar `npm run typecheck`, `npm test` e `npx vue-tsc --noEmit` em `web/` e corrigir o que falhar
- [ ] T064 Executar o roteiro de [quickstart.md](quickstart.md#us2-documentos) (painel demo, terminal com `DB_PATH=data/demo.db` e, se houver numero de teste, WhatsApp), com `AI_PROVIDER=gemini` e com `AI_PROVIDER=claude` quando houver `ANTHROPIC_API_KEY`

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

### Parallel Opportunities

- T002 e T003 em paralelo (arquivos diferentes).
- T008 a T011 tocam o mesmo arquivo (`test/conta.test.ts`): sequenciais.
- Depois de T024: T026, T028 em paralelo; T029 depois de T025.
- T030 e T031 em paralelo.
- US2: T035 e T036 em paralelo; T045 e T046 em paralelo entre si e com a Phase 6; T052 e T053
  depois de T039 e T048; no painel, T059 e T060 em paralelo depois de T057 e T056; T061 e T062
  em paralelo.
- T041 a T044 tocam o mesmo arquivo (`test/documentos.test.ts`): sequenciais.

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

---

## Notes

- [P] = arquivos diferentes, sem dependencia aberta.
- Comentarios no codigo: so o porque, curtos, sem historico.
- Fora desta lista: transferencia de titularidade, exclusao de conta, entrar por WhatsApp,
  perfil contador (US7) e resumo por membro (US3).
- Fora da US2: enviar arquivo pelo painel, pastas criadas pelo usuario, ler DOCX e XLSX,
  armazenamento externo.
