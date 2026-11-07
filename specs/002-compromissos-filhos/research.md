# Research: Compromissos dos filhos

Cada decisao tem a escolha, o motivo e o que foi descartado. Nenhum item ficou como "a esclarecer".

## R1. Modulo novo, sem dependencia nova

- **Decisao**: `src/filhos.ts` com tabelas, regras de dominio, calculo de avisos e textos, no estilo
  de `avisos.ts` e `cobrancas.ts` (funcao `prepararTabelasFilhos(db)`, funcoes puras recebendo `db`
  e `ctx`). Nenhuma biblioteca nova, nem no servidor nem no painel.
- **Motivo**: principio VI. A regra de datas ja existe em `avisos.ts` e `time.ts`.
- **Descartado**: guardar como lembretes comuns (`reminders`) com um prefixo no texto. Perderia o
  filho, o tipo, a repeticao anual e a consulta por filho.

## R2. Tres tabelas, chave pela conta

- **Decisao**: `children`, `child_events` e `child_vaccines`, todas com a coluna `phone` igual ao
  telefone do titular (a conta), como `bills` e `recurring`. `created_by` guarda quem criou.
- **Motivo**: principio I e FR-008. Toda consulta filtra por `phone = ctx.conta`.
- **Descartado**: ligar ao membro que falou. O outro responsavel nao veria os filhos.

## R3. Aviso e um tipo novo do mecanismo atual

- **Decisao**: novo tipo `filhos` em `TIPOS_AVISO` (nome "Compromissos dos filhos", exige agenda,
  hora 9). A tabela `notice_prefs` se recria sozinha com o tipo novo (`atualizarTiposDeAviso`). O
  laco de `rodarAvisos` ja e por pessoa, entao cada membro com agenda recebe e liga ou desliga o
  proprio aviso (FR-014).
- **Motivo**: reaproveita preferencia, hora, pendente fora da janela de 24 horas e a chave de
  deduplicacao de `notice_log`.
- **Descartado**: agendador proprio. Duplicaria a regra de janela e de fila.

## R4. Padrao ligado para quem tem agenda

- **Decisao**: em `padraoLigado`, o tipo `filhos` e ligado para qualquer perfil com a capacidade
  `agenda`. Os outros tipos continuam so do titular.
- **Motivo**: a spec decide que os dois responsaveis recebem. `padraoLigado` devolve falso sem
  agenda, para o perfil "so gastos" nao aparecer como ligado.
- **Efeito em teste**: `test/avisos.test.ts` compara a lista exata de tipos do titular e confere
  que a convidada com "so gastos" nao tem nada ligado. O primeiro caso ganha `filhos: [true, 9,
  true]` e o segundo continua valendo.

## R5. Quando o aviso sai

- **Decisao**: um compromisso aberto, com data e antecedencia `d` (padrao abaixo), gera aviso quando
  `hoje >= data - d`, `hoje <= data` e a data do aviso e posterior ao dia em que o compromisso foi
  criado. A chave de deduplicacao e `filho:{id}:{data}:{d}`.
- **Padrao de antecedencia**: escola, vacina, consulta e outro: 1 dia. Aniversario de amigo: 3 e 1
  dias. Se o usuario informar a antecedencia, vale so ela. Aniversario do proprio filho: 7 dias.
- **Motivo**: a comparacao `>=` faz o aviso sair mesmo que o servidor tenha ficado fora na hora
  certa (edge case da spec), e a chave impede repeticao. Nao avisar quando a data do aviso e o dia
  da criacao evita mandar "amanha tem prova" um minuto depois de o usuario ter dito isso; o resumo
  da manha do proprio dia cobre o resto (FR-016).
- **Descartado**: aviso "no dia". O resumo da manha ja faz isso.
- **Ajuste na spec**: entra um caso de borda dizendo que nao ha aviso retroativo.

## R6. Aniversario do filho e derivado, nao gravado

- **Decisao**: o aniversario de cada filho nao vira linha em `child_events`. E calculado de
  `birth_on` nas listagens e nos avisos, com chave `filho-aniv:{id}:{ano}`. Aparece como item
  `virtual` sem id de compromisso.
- **Motivo**: nao ha o que concluir ou remarcar, e a data de nascimento ja e a fonte unica.
- **Descartado**: gravar um compromisso anual por filho. Duplicaria o dado e criaria linha para
  atualizar toda vez que a data de nascimento fosse corrigida.

## R7. Repeticao

- **Decisao**:
  - **Aniversario de amigo** repete todo ano na mesma linha: quando `data < hoje`, o job diario
    (`avancarRepetidos`) soma 12 meses, volta o presente para "por comprar" e mantem a ideia.
    `anchor_md` guarda o mes e dia originais, para 29 de fevereiro voltar em ano bissexto e valer 28
    em ano comum.
  - **Consulta de rotina** (`repeat_months` de 1 a 24) cria a proxima linha ao ser **concluida**,
    com `data + N meses` da consulta concluida.
  - **Proxima dose de vacina** cria um compromisso do tipo vacina, sem repeticao.
- **Motivo**: aniversario nao depende de o usuario fazer algo, consulta sim (so repete depois de
  acontecer, como diz a spec).
- **Descartado**: gerar os proximos anos adiantado. Poluiria listas e o painel.

## R8. Vacina

- **Decisao**: `child_vaccines` guarda o historico (nome, dose, data aplicada). Informando a proxima
  dose, `registrar_vacina` cria o compromisso e guarda o id em `next_event_id`. O produto nao tem
  calendario nem recomenda vacinas, doses ou prazos (FR-029, principio VII). A pergunta "que vacinas
  precisa tomar" tem resposta fixa na ferramenta de consulta.
- **Motivo**: informacao de saude errada e pior que nenhuma, e fica fora do escopo.

## R9. Resolver o filho pelo nome

- **Decisao**: o nome informado e comparado sem acento e sem diferenca de maiusculas. Acerto exato
  ou prefixo unico resolve. Ambiguidade ou zero resultado devolve texto de erro orientando o modelo a
  perguntar, como `buscar_documentos` e `cancelar_envio` fazem hoje. Com um filho so, o filho e
  implicito.
- **Motivo**: FR-006 e o cenario da spec. A regra fica no dominio, igual para os dois provedores.

## R10. Ferramentas do assistente

- **Decisao**: sete ferramentas: `cadastrar_filho`, `listar_filhos`, `remover_filho`,
  `registrar_compromisso_filho`, `consultar_compromissos_filhos`, `atualizar_compromisso_filho` e
  `registrar_vacina`. Todas exigem a capacidade `agenda`. Duas linhas novas no prompt de sistema.
- **Custo (principio IV)**: as definicoes entram no bloco de ferramentas, que usa cache nos
  provedores. O aumento estimado e de cerca de 1.500 tokens de definicao, sem chamada extra ao
  modelo, porque as ferramentas rodam local. Fica dentro da meta de R$ 3 por conta.
- **Descartado**: uma ferramenta unica com `acao`. Cinco ou seis formatos de entrada num esquema
  so confundem o modelo e dificultam o teste.

## R11. Painel

- **Decisao**: rota `/agenda/filhos` (`meta.mesa = "agenda"`), `FilhosView.vue` em
  `web/src/views/agenda/`, e um botao "Filhos" em `AgendaMesa.vue`, como "Documentos" em Tarefas.
  Nao mexe no submenu lateral. O titulo do topo ("Agenda / Filhos") usa um pequeno mapa de
  subpaginas em `mesas.ts`.
- **Motivo**: dois cliques a partir do menu (SC-006) e o padrao ja usado.
- **Descartado**: mesa nova "Familia". Exigiria assessor, cor e item de menu para um recurso da Lia.

## R12. Exclusao de dados

- **Decisao**: remover um filho apaga seus compromissos e vacinas na mesma transacao. A
  funcao `apagarFilhosDaConta(db, conta)` fica pronta, mas **o produto nao tem exclusao de conta**
  (o README diz isso). O requisito FR-032 vale para o filho agora e para a conta quando existir.
- **Motivo**: principio VII, nao prometer o que nao funciona.
- **Ajuste na spec**: FR-032 passa a dizer isso.

## R13. Dados sensiveis e IA

- **Decisao**: nenhuma regra nova de provedor. O principio I ja proibe dado de terceiros em plano
  de IA que permita treinar. O README ganha um aviso curto sobre dados de crianca e de saude. O
  corpo das requisicoes de `/api/filhos` nao entra em log (o log de requisicao do Fastify ja grava so
  metodo e URL).
- **Motivo**: dado de crianca e de saude e sensivel (LGPD).

## R14. Limites

- **Decisao**: 10 filhos por conta, nome de 1 a 40 caracteres, titulo de 1 a 80, observacao ate 300,
  local ate 80, `repeat_months` de 1 a 24, antecedencia de 0 a 60 dias.
- **Motivo**: proteger o uso e caber no formato das mensagens.

## R15. Dados de demonstracao

- **Decisao**: `src/seed.ts` cria dois filhos (Marina, 8 anos, e Pedro) com compromissos de todos os
  tipos, um aniversario de amigo com presente por comprar e uma vacina com proxima dose, e limpa as
  tabelas novas na restauracao. A conta da Bia (so gastos) serve para conferir o bloqueio.
- **Motivo**: a constituicao manda conferir o painel com `npm run painel:demo`.
