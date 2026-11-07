---

description: "Tarefas da feature Compromissos dos filhos"
---

# Tasks: Compromissos dos filhos

**Input**: Design documents from `/specs/002-compromissos-filhos/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: incluidos. A constituicao exige teste em `test/` para regra de dominio nova e `npm test`
verde antes do commit. Em cada historia, os testes vem antes da implementacao e devem falhar primeiro.

**Organization**: tarefas agrupadas por historia (US1 a US5). Todas dependem da fundacao (Phase 2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependencia pendente)
- **[Story]**: historia da spec a que a tarefa pertence
- Os caminhos sao do repositorio `assessor-mvp`

## Path Conventions

- Back-end em `src/`, painel em `web/src/`, testes em `test/`
- Regra de dominio em `src/filhos.ts`; ferramentas, rotas e agendador so chamam as funcoes dele
- `src/filhos.ts` importa de `src/avisos.ts` e de `src/time.ts`, **nunca o contrario**: evita import
  circular. O que `avisos.ts` precisa de filhos (linhas do resumo da manha) chega por parametro.
- Erros de regra usam `new AuthError(status, "mensagem em portugues")`, como `avisos.ts`

---

## Phase 1: Setup

**Purpose**: esqueleto do teste novo

- [X] T001 Criar `test/filhos.test.ts` com o cabecalho no estilo de `test/avisos.test.ts`: as mesmas
  variaveis de ambiente antes dos imports; imports dinamicos de `../src/db.js`, `../src/conta.js`,
  `../src/filhos.js`, `../src/avisos.js`, `../src/tools.js`, `../src/auth.js`, `../src/server.js`,
  `../src/scheduler.js` e `../src/time.js`; `titular = "5511999990000"`, `bia = "5511912345678"`;
  `HOJE = "2026-11-10"` (terca-feira) e `as(data, hora = "10:00")` com `fromLocal`; helpers
  `contaCom(perfil?)` (banco `:memory:`, titular e, com perfil, a Bia entra por convite), `ctxDe(repo,
  phone)` e `coletor(falhar = false)` que devolve `{ enviados, send }`. **Usar so datas fixas** nos
  dados do teste (nada de `new Date()` ou `localDate()` como data de compromisso), para o teste nao
  depender do dia real em que roda
- [X] T002 Em `package.json`, acrescentar `test/filhos.test.ts` ao fim da lista do script `test`
  (depende de T001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tabelas, filhos, tipo de aviso e permissao. Bloqueia todas as historias.

**Atencao**: nenhuma historia comeca antes do checkpoint.

### Tests

> Escrever antes da implementacao e ver falhar.

- [X] T003 Em `test/filhos.test.ts`, testar a fundacao: `prepararTabelasFilhos` duas vezes nao falha;
  `cadastrarFilho` guarda `name` de 1 a 40 caracteres e recusa repetido sem acento e sem diferenca de
  maiusculas (`409`); recusa o 11o filho (`409`, "Limite de 10 filhos por conta."); recusa `birth_on`
  futuro ou de mais de 25 anos (`400`); aceita `approx_age` de 0 a 25 so quando nao ha `birth_on` e
  recusa os dois juntos; idade calculada pela data de nascimento e, sem ela, por `approx_age` mais os
  anos inteiros desde `approx_age_on`; `removerFilho` apaga compromissos e vacinas dele na mesma
  transacao e devolve as contagens; `resolverFilho` acha por nome sem acento, por prefixo unico,
  devolve o erro orientador de [contracts/ferramentas-filhos.md](contracts/ferramentas-filhos.md) em
  ambiguidade e em nenhum, e aceita `null` com um filho so; duas contas com filho de mesmo nome nao se
  enxergam e id de outra conta devolve `404`; perfil `so_gastos` recebe `SemPermissao`, perfil
  `agenda_tarefas` nao

### Implementation

- [X] T004 Criar `src/filhos.ts` com os tipos (`Filho`, `Compromisso`, `Vacina`, `TipoCompromisso`),
  as constantes (`TIPOS_COMPROMISSO` = `escola`, `aniversario_amigo`, `vacina`, `consulta`, `outro`;
  `LIMITE_FILHOS = 10`) e `prepararTabelasFilhos(db)` com as tres tabelas de
  [data-model.md](data-model.md) (R2): `children`, `child_events` e `child_vaccines`, com os `CHECK`
  de `kind` (`escola`, `aniversario_amigo`, `vacina`, `consulta`, `outro`), `gift_status`
  (`por_comprar`, `comprado`) e `status` (`aberto`, `concluido`, `cancelado`), e os indices
  `(phone)`, `(phone, status, due_on)`, `(child_id)` e `(child_id, applied_on)`
- [X] T005 Em `src/db.ts`, chamar `prepararTabelasFilhos(db)` em `openDb`, depois de
  `prepararTabelasCobrancas` (depende de T004)
- [X] T006 Em `src/filhos.ts` (R9, R12, R14), as funcoes de filho: `cadastrarFilho(db, ctx, { nome,
  nascimento?, idadeAproximada? }, hoje)` (exige `agenda`; `name` de 1 a 40 caracteres, unico por
  conta sem acento e sem diferenca de maiusculas; `birth_on` "nao pode ser futura nem ter mais de 25
  anos"; `approx_age` de 0 a 25 e so sem `birth_on`, gravando `approx_age_on = hoje`; limite de 10 por
  conta); `listarFilhos(db, ctx, hoje)` com idade e `idadeAproximada`; `atualizarFilho(db, ctx, id,
  d)`; `removerFilho(db, ctx, id)` que apaga vacinas, compromissos e filho numa transacao e devolve as
  contagens; `apagarFilhosDaConta(db, conta)`; `resolverFilho(db, ctx, nome)` que devolve o `Filho` ou
  `{ erro }` com os textos do contrato. Toda consulta filtra por `phone = ctx.conta` (depende de T004)
- [X] T007 Em `src/avisos.ts`, acrescentar ao fim de `TIPOS_AVISO` o tipo `filhos` (nome "Compromissos
  dos filhos", descricao "Antes de cada compromisso dos filhos e nos aniversarios deles", `exige:
  ["agenda"]`, `hora: 9`) e, em `padraoLigado`, devolver `pode(ctx, "agenda")` para `filhos` (R3, R4).
  A tabela `notice_prefs` se recria sozinha por `atualizarTiposDeAviso`
- [X] T008 Em `test/avisos.test.ts`, no teste de fundacao, incluir `filhos: [true, 9, true]` na lista
  exata de preferencias do titular; a conferencia de que a Bia "so gastos" nao tem nada ligado
  continua valendo (depende de T007)
- [X] T009 [P] Em `web/src/api.ts`, acrescentar `"filhos"` ao tipo `TipoAviso` (depende de T007)

**Checkpoint**: T003 e T008 verdes; `npm run typecheck` passa; o painel de Avisos ja lista o tipo
novo.

---

## Phase 3: User Story 1 - Cadastrar filhos e registrar compromissos pela conversa (Priority: P1)

**Goal**: o usuario cadastra os filhos e registra compromissos do jeito que fala, e o assessor
descobre o filho, pergunta o que falta e confirma.

**Independent Test**: com a conta demo, cadastrar dois filhos e registrar um compromisso de cada tipo
por texto, conferindo filho, data, hora e tipo (spec, US1; quickstart, US1).

### Tests for User Story 1

- [X] T010 [US1] Em `test/filhos.test.ts`, testar `criarCompromisso`: cada tipo grava os campos certos
  e recusa os de outro tipo (`subject` so em `escola`; `friend_name`, `gift_idea` e `gift_status` so
  em `aniversario_amigo`, com `gift_status` padrao `por_comprar`); `title` de 1 a 80, `friend_name` de
  1 a 40, `gift_idea` ate 80, `place` ate 80, `notes` ate 300, `lead_days` de 0 a 60, `repeat_months`
  de 1 a 24 so em `consulta` e 12 fixo em `aniversario_amigo`; sem `due_on` grava "a marcar"; `due_time`
  exige `due_on`; `anchor_md` guardado so no aniversario de amigo; data no passado sem `jaAconteceu`
  recusa, com `jaAconteceu` grava `concluido` sem aviso; `created_on` e `created_by` preenchidos; filho
  de outra conta recusa (`404`); `so_gastos` recebe `SemPermissao`
- [X] T011 [US1] Em `test/filhos.test.ts`, testar as ferramentas `cadastrar_filho`,
  `listar_filhos`, `remover_filho` (sem `confirmado` pede confirmacao e nao apaga) e
  `registrar_compromisso_filho`: filho unico fica implicito; com dois filhos e `filho` nulo devolve o
  texto de ambiguidade sem gravar; confirmacao com dia da semana, data e hora; aniversario traz "Aviso 3
  dias antes e na vespera" e o presente; sem data diz "a marcar" e "toda semana"; `Sem permissao` para
  `so_gastos`

### Implementation for User Story 1

- [X] T012 [US1] Em `src/filhos.ts`, `criarCompromisso(db, ctx, d, hoje)` com as regras de T010
  (R5, R7, R14) e `descreverCompromisso(c)` com os textos de confirmacao do contrato, incluindo o dia da
  semana. Aniversario de amigo grava `repeat_months = 12` e `anchor_md = MM-DD` da data (depende de
  T006)
- [X] T013 [US1] Em `src/tools.ts`, esquemas zod de `cadastrar_filho`, `listar_filhos`,
  `remover_filho` e `registrar_compromisso_filho` conforme [contracts/ferramentas-filhos.md](contracts/ferramentas-filhos.md)
  (`nome` de 1 a 40, `titulo` de 1 a 80, `avisar_dias_antes` de 0 a 60, `repetir_meses` de 1 a 24,
  `ja_aconteceu` opcional), e as quatro em `CAPACIDADE` com `agenda` (depende de T012)
- [X] T014 [US1] Em `src/tools.ts`, declarar as quatro com `tool(...)` e os `case` em `executeTool`,
  usando `resolverFilho` e `descreverCompromisso`; `remover_filho` com `confirmado` segue o padrao de
  `excluir_documento` (depende de T013)
- [X] T015 [US1] Em `src/prompt.ts`, a primeira linha de regra de filhos do contrato: cadastrar,
  registrar, perguntar de qual filho, e o que fazer sem data (depende de T014)

**Checkpoint**: T010 e T011 verdes; roteiro de [quickstart.md](quickstart.md#us1-cadastrar-e-registrar-pela-conversa)
passando no terminal.

---

## Phase 4: User Story 2 - Avisos antes dos compromissos e repeticao anual (Priority: P1)

**Goal**: o assessor avisa antes de cada compromisso sem o usuario pedir, repete o aniversario de
amigo todo ano e avisa o aniversario de cada filho.

**Independent Test**: com datas simuladas, criar compromissos de cada tipo e conferir que o aviso sai
uma vez, no dia certo, e que o aniversario do amigo volta no ano seguinte (spec, US2; quickstart, US2).

### Tests for User Story 2

- [X] T016 [US2] Em `test/filhos.test.ts`, testar `avisosDevidos(db, conta, hoje)` (R5): escola,
  vacina, consulta e outro avisam 1 dia antes; aniversario de amigo avisa 3 e 1 dias antes, com o
  presente citado no de 3 dias e, na vespera, so se `por_comprar`; `lead_days` informado vale no lugar
  do padrao; nada para `concluido`, `cancelado` ou sem data; compromisso criado no dia do aviso ou
  depois nao gera aviso retroativo; se o agendador ficou parado, o aviso sai ao voltar enquanto a data
  nao passou; a chave `filho:{id}:{due_on}:{lead}` impede repetir; remarcar muda a chave e o aviso da
  data antiga nao sai
- [X] T017 [US2] Em `test/filhos.test.ts`, testar o aniversario do filho e a repeticao: aviso 7 dias
  antes com a idade que completa e chave `filho-aniv:{id}:{ano}`; filho sem `birth_on` nao gera aviso;
  nascido em 29 de fevereiro vale 28 em ano comum e 29 em bissexto; `avancarRepetidos(db, hoje)` leva o
  aniversario de amigo vencido para 12 meses depois, volta o presente a `por_comprar` e mantem a ideia;
  simulando 3 anos, exatamente um aviso de 3 dias e um de vespera por ano (SC-004)
- [X] T018 [US2] Em `test/filhos.test.ts`, testar o agendador com `rodarAvisos` e `coletor`: titular e
  membro `agenda_tarefas` recebem cada um o seu aviso uma vez; membro `so_gastos` nao recebe; preferencia
  desligada nao envia; antes da hora escolhida nao envia; `send` que falha (fora da janela de 24 horas)
  grava em `pending_notices`; lembrete semanal de "a marcar" sai uma vez por semana ISO enquanto houver
  item sem data; o resumo da manha traz os compromissos dos filhos do dia

### Implementation for User Story 2

- [X] T019 [US2] Em `src/filhos.ts`, `avisosDevidos(db, conta, hoje)` que devolve `{ chave, texto }[]`
  pela regra de R5, com os textos de aviso (curtos, no tom dos de `avisos.ts`, citando filho, o que e,
  a data e a hora; aniversario de amigo com o presente) e o aniversario do filho (R6) (depende de
  T012)
- [X] T020 [US2] Em `src/filhos.ts`, `avancarRepetidos(db, hoje)` (R7) e a soma de meses com `anchor_md`
  que trata 29 de fevereiro; so mexe em `aniversario_amigo` aberto com `due_on < hoje` (depende de
  T012)
- [X] T021 [US2] Em `src/filhos.ts`, `lembreteAMarcar(db, conta)` (texto com os itens sem data, ou
  `null`) e `linhasDoDia(db, ctx, hoje)` (linhas do resumo da manha com os compromissos do dia dos
  filhos, vazio sem agenda) (depende de T012)
- [X] T022 [US2] Em `src/avisos.ts`, `resumoManha` recebe um parametro opcional `extras: string[] = []`
  e o acrescenta as linhas, sem importar `filhos.ts` (depende de T021)
- [X] T023 [US2] Em `src/scheduler.ts`: no inicio de `rodarAvisos`, chamar `avancarRepetidos(db,
  hoje)`; novo `case "filhos"` que entrega cada item de `avisosDevidos(db, ctx.conta, hoje)` com
  `entregar(db, send, phone, p.tipo, chave, texto, now)` e, uma vez por semana ISO (`uma`), o
  `lembreteAMarcar`; passar `linhasDoDia` como `extras` em `resumoManha` e em `buildDailySummary`
  (depende de T019, T020, T021, T022)
- [X] T024 [US2] Conferir que `configurar_avisos` em `src/tools.ts` e a tela
  `web/src/views/operacao/AvisosView.vue` aceitam e mostram o tipo `filhos` sem codigo extra (o enum e a
  lista saem de `TIPO_IDS` e da API); se algum texto fixo listar os tipos, incluir o novo. Acrescentar
  em `test/filhos.test.ts` o caso de ligar e desligar `filhos` por `configurar_avisos` (depende de T007)

**Checkpoint**: T016 a T018 verdes; roteiro de [quickstart.md](quickstart.md#us2-avisos-e-repeticao)
passando.

---

## Phase 5: User Story 3 - Consultar o que vem por ai e atualizar compromissos (Priority: P2)

**Goal**: o usuario ve o que vem por ai por filho e na semana, conclui, remarca, cancela e marca o
presente como comprado, e os avisos acompanham.

**Independent Test**: com varios compromissos, pedir a lista da semana por filho e dos proximos 30
dias, concluir um, remarcar outro e conferir os avisos (spec, US3; quickstart, US3).

### Tests for User Story 3

- [X] T025 [US3] Em `test/filhos.test.ts`, testar `listarCompromissos(db, ctx, filtro, hoje)`: ordem de
  data; agrupamento por filho; inclui o aniversario de cada filho no periodo como item `virtual` sem id;
  filtros por filho, tipo e periodo; "a marcar" listados a parte; `concluido` e `cancelado` fora por
  padrao e dentro com `situacao`; periodo vazio devolve vazio, sem item inventado; outra conta e perfil
  sem agenda nao veem nada
- [X] T026 [US3] Em `test/filhos.test.ts`, testar `atualizarCompromisso` e as ferramentas
  `consultar_compromissos_filhos` e `atualizar_compromisso_filho`: concluir, cancelar e reabrir mudam a
  situacao e os avisos; remarcar muda `due_on` e `due_time`; `presente_comprado` tira o presente do aviso
  da vespera; id de outra conta ou inexistente devolve "Compromisso #N nao encontrado."; a resposta da
  consulta agrupa por filho, traz o presente nos aniversarios e termina com os "a marcar"

### Implementation for User Story 3

- [X] T027 [US3] Em `src/filhos.ts`, `listarCompromissos(db, ctx, filtro, hoje)` com o contrato de
  [contracts/api-filhos.md](contracts/api-filhos.md) (`compromissos`, `aMarcar`, `semana`), incluindo os
  aniversarios derivados (R6) e `textoLista(...)` com o formato de resposta da ferramenta (depende de
  T019)
- [X] T028 [US3] Em `src/filhos.ts`, `atualizarCompromisso(db, ctx, id, d, hoje)` com as acoes
  `concluir`, `cancelar`, `reabrir`, `presente_comprado` e `presente_por_comprar`, e a edicao de
  titulo, data, hora, local, observacao e `lead_days`; devolve `{ compromisso, proximo: null }` (a
  consulta de rotina e da US5) (depende de T012)
- [X] T029 [US3] Em `src/tools.ts`, esquemas, capacidade `agenda`, declaracao e `case` de
  `consultar_compromissos_filhos` e `atualizar_compromisso_filho` conforme o contrato (`id` inteiro,
  `nova_data`, `nova_hora`, `avisar_dias_antes` de 0 a 60) (depende de T027, T028)
- [X] T030 [US3] Em `src/prompt.ts`, a parte da linha de regra sobre "o que vem por ai", concluir,
  remarcar e "ja comprei o presente" (depende de T029)

**Checkpoint**: T025 e T026 verdes; roteiro de [quickstart.md](quickstart.md#us3-consultar-e-atualizar)
passando.

---

## Phase 6: User Story 4 - Tela Filhos no painel (Priority: P2)

**Goal**: o painel mostra os filhos e a semana de todos numa tela, e permite criar, editar, concluir,
remarcar e apagar, com as mesmas regras da conversa.

**Independent Test**: criar um compromisso pelo WhatsApp e ve-lo no painel; editar a data no painel e
o assessor responder com a nova (spec, US4; quickstart, US4).

### Tests for User Story 4

- [X] T031 [US4] Em `test/filhos.test.ts`, testar as rotas (padrao de `avisos.test.ts`, com `buildServer`
  e `contas.abrirSessao`): `GET/POST /api/filhos`, `PATCH` e `DELETE /api/filhos/:id`;
  `GET/POST /api/filhos/compromissos`, `PATCH` com `acao` e `DELETE /api/filhos/compromissos/:id`;
  formas de resposta do contrato; `400` para validacao, `409` para nome repetido e limite; `403` com
  `SEM_ACESSO` para `so_gastos`; `404` para id de outra conta; compromisso criado pela rota e lido pela
  ferramenta `consultar_compromissos_filhos`, e o contrario

### Implementation for User Story 4

- [X] T032 [US4] Em `src/api.ts`, as rotas de filhos e compromissos de [contracts/api-filhos.md](contracts/api-filhos.md)
  com as entradas `["agenda"]` em `CAPACIDADE_ROTA` e zod (`nome` 1 a 40, `titulo` 1 a 80, `observacao`
  ate 300, `local` ate 80, `antecedenciaDias` 0 a 60, `repetirMeses` 1 a 24, datas `AAAA-MM-DD`, hora
  `HH:MM`), usando as funcoes de `src/filhos.ts` e `responderErro` (depende de T027, T028)
- [X] T033 [P] [US4] Em `web/src/api.ts`, os tipos `Filho`, `Compromisso`, `TipoCompromisso` e as
  respostas das rotas (depende de T032)
- [X] T034 [US4] Criar `web/src/views/agenda/FilhosView.vue`, no padrao de
  `web/src/views/financas/ContasView.vue` (`useCarregar`, `executar`): cartao por filho (nome, idade,
  proximo compromisso, botao remover com confirmacao); lista da semana de todos; filtros por filho e
  tipo; criar e editar compromisso (tipo, titulo, data, hora, local, observacao, disciplina, amigo,
  presente, antecedencia); concluir, remarcar, cancelar e apagar; "presente comprado" e destaque dos
  aniversarios com presente por comprar; cadastro de filho (nome, nascimento ou idade aproximada);
  estado vazio com exemplo de frase e botao para o primeiro filho; mensagem de sem permissao igual as
  outras telas; funciona em tema claro, escuro e largura de celular (depende de T033)
- [X] T035 [US4] Rota `/agenda/filhos` com `meta: { mesa: "agenda" }` em `web/src/router.ts`; botao
  "Filhos" em `web/src/views/AgendaMesa.vue` (como "Documentos" em `TarefasMesa.vue`, so com a
  capacidade `agenda`); em `web/src/mesas.ts`, um mapa de subpaginas e, em `web/src/App.vue`, o `pagina`
  do topo passa a usa-lo para mostrar "Agenda / Filhos" (depende de T034)
- [X] T036 [US4] Em `src/seed.ts`, criar os filhos de demonstracao (Marina, 8 anos, com data de
  nascimento, e Pedro) com compromissos de escola, aniversario de amigo com presente por comprar,
  consulta e "a marcar", em datas relativas a hoje, e incluir `children`, `child_events` e
  `child_vaccines` na limpeza de restauracao da conta demo (depende de T012)

**Checkpoint**: T031 verde; roteiro de [quickstart.md](quickstart.md#us4-painel) passando no
`npm run painel:demo`, com a Bia vendo so a mensagem de sem permissao.

---

## Phase 7: User Story 5 - Vacinas com proximas doses e consultas de rotina (Priority: P3)

**Goal**: o usuario registra a vacina aplicada e a proxima dose vira compromisso com aviso; a consulta
de rotina se repete depois de concluida; o painel mostra o historico.

**Independent Test**: registrar uma vacina com proxima dose em 6 meses e conferir compromisso e
historico; concluir uma consulta que repete a cada 6 meses e conferir a seguinte (spec, US5;
quickstart, US5).

### Tests for User Story 5

- [X] T037 [US5] Em `test/filhos.test.ts`, testar `registrarVacina`, `listarVacinas` e a consulta de
  rotina: `name` de 1 a 60, `dose` ate 20, `applied_on` "nao pode ser futura" (`400`); `proximaEmMeses`
  (1 a 24) cria o compromisso `vacina` na data certa, com aviso, e guarda `next_event_id`;
  `proximaData` faz o mesmo; os dois juntos recusam (`400`); sem proxima dose nao cria compromisso;
  historico em ordem decrescente de data; concluir `consulta` com `repeat_months` cria a seguinte em
  `due_on` mais N meses (com ajuste de fim de mes) e devolve `proximo`; concluir consulta sem repeticao
  nao cria; cancelar nao repete
- [X] T038 [US5] Em `test/filhos.test.ts`, testar a ferramenta `registrar_vacina` e as rotas de vacina
  (`GET /api/filhos/:id/vacinas`, `POST /api/filhos/vacinas`): resposta com e sem proxima dose;
  `consultar_compromissos_filhos` com `tipo` `vacina` ou `consulta` termina com a linha fixa de "nao
  indico quais vacinas ou consultas fazer" e nunca sugere vacina, dose ou prazo (SC-007); `403` para
  `so_gastos`; `404` para outra conta

### Implementation for User Story 5

- [X] T039 [US5] Em `src/filhos.ts`, `registrarVacina(db, ctx, d, hoje)` e `listarVacinas(db, ctx,
  filhoId)` com as regras de T037 (R8), criando o compromisso da proxima dose por `criarCompromisso`
  (depende de T012)
- [X] T040 [US5] Em `src/filhos.ts`, em `atualizarCompromisso`, concluir uma `consulta` com
  `repeat_months` cria a proxima ocorrencia e a devolve em `proximo` (R7) (depende de T028)
- [X] T041 [US5] Em `src/tools.ts`, esquema, capacidade `agenda`, declaracao e `case` de
  `registrar_vacina` conforme o contrato (`vacina` de 1 a 60, `dose`, `proxima_data` e `proxima_em_meses`
  exclusivos); em `consultar_compromissos_filhos`, acrescentar a linha fixa quando `tipo` for `vacina`
  ou `consulta` (depende de T039, T029)
- [X] T042 [US5] Em `src/prompt.ts`, a segunda linha de regra do contrato (registrar vacina e nunca
  indicar vacinas, doses ou idades) (depende de T041)
- [X] T043 [US5] Em `src/api.ts`, `GET /api/filhos/:id/vacinas` e `POST /api/filhos/vacinas` com
  `["agenda"]` em `CAPACIDADE_ROTA`; `PATCH` de compromisso passa a devolver `proximo` quando concluir
  uma consulta repetida (depende de T039, T040, T032)
- [X] T044 [US5] Em `web/src/api.ts` e `web/src/views/agenda/FilhosView.vue`: tipo `Vacina`; no cartao do
  filho, o historico de vacinas em ordem de data e as proximas doses; formulario "Vacina aplicada" (vacina,
  dose, data, proxima dose por data ou em meses); campo "Repetir a cada N meses" nas consultas; aviso
  fixo de que o produto nao indica vacinas, doses nem prazos (depende de T043, T034)
- [X] T045 [US5] Em `src/seed.ts`, acrescentar ao Pedro uma vacina aplicada com proxima dose e uma consulta
  de rotina que repete a cada 6 meses (depende de T036, T039)

**Checkpoint**: T037 e T038 verdes; roteiro de [quickstart.md](quickstart.md#us5-vacinas-e-consultas-de-rotina)
passando.

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: documentacao, verificacao e conferencia

- [X] T046 [P] Em `README.md`: secao "Filhos" (cadastrar, registrar por conversa e no painel, avisos e a
  antecedencia padrao, aniversario de amigo e do filho, vacinas e consulta de rotina, tela Filhos); aviso
  de que o produto **nao indica vacinas, doses nem prazos**, de que **ainda nao ha exclusao de conta** (so
  remover o filho apaga os dados dele) e de que dado de crianca e de saude e sensivel e segue a regra de
  plano de IA do principio I; limites (10 filhos, tamanhos de texto, foto de convite fora); tabela "Como
  esta organizado" com `src/filhos.ts`
- [X] T047 Rodar `npm run typecheck`, `npm test` e `npx vue-tsc --noEmit` em `web/` e corrigir o que
  falhar (depende de tudo acima)
- [X] T048 Conferir o painel com `npm run painel:demo` seguindo [quickstart.md](quickstart.md#us4-painel):
  tela Filhos como `demo@assessor.local`, bloqueio como `bia@assessor.local`, estado vazio numa conta nova,
  tema claro e escuro, largura de celular sem rolagem lateral e console sem erro (depende de T047)
- [X] T049 Executar o roteiro de [quickstart.md](quickstart.md) pelo terminal com `DB_PATH=data/demo.db` e,
  se houver numero de teste, pelo WhatsApp, com `AI_PROVIDER=gemini` e com `AI_PROVIDER=claude` quando
  houver `ANTHROPIC_API_KEY` (principio III). Feito em 2026-11-07 pelo terminal com Gemini (seis frases, uma por ferramenta nova); Claude e WhatsApp ficam para quando houver chave e numero de teste

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependencias
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as historias
- **US1 (Phase 3)**: depende da Phase 2
- **US2 (Phase 4)**: depende da US1 (usa `criarCompromisso`)
- **US3 (Phase 5)**: depende da US1; o aviso da US2 nao e necessario, mas a consulta usa os textos de T019
- **US4 (Phase 6)**: depende das US1 e US3 (as rotas chamam listar e atualizar)
- **US5 (Phase 7)**: depende das US1, US3 e US4 (o painel e a consulta de rotina estendem o que existe)
- **Polish (Phase 8)**: depende das historias desejadas

### Dentro da Phase 2

- T004 > T005 e T006; T007 > T008 e T009; T003 antes de T006.

### Dentro da US1

- T012 > T013 > T014 > T015; T010 antes de T012; T011 antes de T013.

### Dentro da US2

- T012 > T019, T020 e T021 (mesmo arquivo: sequenciais); T021 > T022; T019, T020, T021 e T022 > T023.
- T007 > T024.
- Testes: T016 antes de T019; T017 antes de T020; T018 antes de T021 a T023.

### Dentro da US3

- T019 > T027; T012 > T028; T027 e T028 > T029 > T030.
- Testes: T025 antes de T027; T026 antes de T028 e T029.

### Dentro da US4

- T027 e T028 > T032 > T033 > T034 > T035; T012 > T036.
- Testes: T031 antes de T032.

### Dentro da US5

- T012 > T039; T028 > T040; T039 e T029 > T041 > T042; T039, T040 e T032 > T043 > T044; T036 e T039 > T045.
- Testes: T037 antes de T039 e T040; T038 antes de T041 e T043.

### Parallel Opportunities

- T009 em paralelo com T008.
- T033 (tipos do painel) em paralelo com a escrita do teste T031 depois que T032 existir.
- T046 (README) em paralelo com qualquer tarefa depois de T044.
- Duas pessoas: uma na US2 (agendador e textos) e outra na US3 (consulta e atualizacao) depois da US1,
  porque mexem em partes diferentes de `src/filhos.ts` e de `src/tools.ts`, mas se encontram em T029 e T041.

---

## Parallel Example: Phase 2

```bash
# Depois de T007: o tipo de aviso novo e o seu reflexo no painel
Task: "Em test/avisos.test.ts, incluir filhos na lista exata de preferencias (T008)"
Task: "Em web/src/api.ts, acrescentar filhos ao tipo TipoAviso (T009)"
```

---

## Implementation Strategy

### MVP First (US1 e US2 juntas)

As duas historias sao P1 e uma sem a outra nao entrega valor: cadastrar sem avisar e uma lista, e
avisar sem cadastrar nao existe.

1. Phase 1 e Phase 2 (fundacao).
2. Phase 3 (US1): cadastro e registro por conversa.
3. Phase 4 (US2): avisos, repeticao e resumo.
4. **PARAR e VALIDAR**: roteiros US1 e US2 do quickstart, no terminal com o banco demo.
5. Demonstrar: o produto ja cuida da rotina dos filhos, sem painel.

### Entrega incremental

1. MVP (US1 e US2).
2. US3: consulta e atualizacao pela conversa. Valor: organizar a semana.
3. US4: tela Filhos. Valor: conferir e corrigir de uma vez.
4. US5: vacinas e consulta de rotina. Valor: o que mais custa esquecer, com historico.
5. Polish: README, verificacao e conferencia.

## Notes

- Cada tarefa que mexe em `src/tools.ts` e `src/prompt.ts` vale para os dois provedores de IA
  (principio III); o teste das ferramentas roda sem modelo
- Nada de data real do relogio em dado de teste: as datas sao fixas e o "hoje" e passado por parametro
- Commits em portugues no formato Conventional Commits, um por historia ou grupo logico, com
  `npm test` verde antes de cada um
- Comentarios no codigo explicam so o porque; historico vai na mensagem do commit
