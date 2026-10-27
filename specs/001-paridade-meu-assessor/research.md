# Research: Paridade com o Meu Assessor

Decisoes por historia. R1 a R10 sao da US1 (conta compartilhada), R11 a R22 da US2 (documentos)
e R23 a R34 da US3 (avisos proativos), todas implementadas; R35 a R46 sao da US4 (Google Agenda).
As demais historias acrescentam secoes aqui.

# US1: Conta compartilhada

## R1. Como representar a conta

- **Decision**: a conta continua identificada pelo telefone do titular. A coluna `phone` das
  tabelas de dados (transactions, reminders, tasks, research) passa a significar "telefone da
  conta". Uma tabela nova, `account_members`, liga o telefone de cada membro ao telefone da conta.
- **Rationale**: todas as funcoes de `src/db.ts` e todas as rotas de `src/api.ts` ja filtram por
  `phone`. Resolver membro para conta uma vez, na entrada (webhook, terminal, sessao do painel),
  mantem as consultas atuais e o isolamento ja testado ("transacoes de outro usuario nao
  aparecem"). Principio VI.
- **Alternatives considered**: tabela `accounts` com `account_id` em todas as tabelas. Mais
  limpo a longo prazo, mas exige migrar todas as linhas e trocar a assinatura de todo o repo.
  Fica para quando a transferencia de titularidade (fora desta entrega) pedir.

## R2. Autoria dos registros

- **Decision**: coluna `created_by TEXT` (telefone de quem criou) em transactions, reminders e
  tasks. Nula nos registros antigos, lida como "titular".
- **Rationale**: FR-004 e o cenario 4 pedem mostrar quem lancou. Coluna nula evita reescrever
  dados existentes.
- **Alternatives considered**: tabela de auditoria separada. Mais pesada e sem uso por enquanto.

## R3. Historico de conversa

- **Decision**: o historico continua por telefone do membro, nao da conta.
- **Rationale**: cada pessoa tem a propria conversa no WhatsApp. Misturar historicos faria o
  modelo responder ao contexto de outra pessoa e aumentaria tokens (principio IV).

## R4. Para quem vao lembretes e resumo

- **Decision**: lembretes ganham `notify_phone` (padrao: quem criou). O agendador envia para
  `COALESCE(notify_phone, phone)`. O resumo da manha continua indo so para o titular nesta
  entrega.
- **Rationale**: o lembrete do remedio da esposa nao pode chegar no WhatsApp do marido. O resumo
  por membro depende dos avisos da US3 e entra la.

## R5. Perfis e onde a permissao e aplicada

- **Decision**: perfis fixos em `src/permissoes.ts`, como mapa de perfil para capacidades:

  | Perfil | Despesas | Receitas | Agenda | Tarefas | Gerir acessos |
  | --- | --- | --- | --- | --- | --- |
  | titular | ler/criar | ler/criar | sim | sim | sim |
  | completo | ler/criar | ler/criar | sim | sim | nao |
  | so_gastos | ler/criar | nao | nao | nao | nao |
  | agenda_tarefas | nao | nao | sim | sim | nao |

  A permissao e conferida em dois pontos de codigo: em `executeTool` (cada ferramenta declara a
  capacidade exigida; consultas de transacao de quem so ve despesas recebem `kind = despesa`
  forcado) e no hook de rota da API (cada rota declara a capacidade). O prompt recebe o perfil
  so para o modelo nao oferecer o que nao pode; a seguranca nao depende dele.
- **Rationale**: principio I. O modelo pode ser convencido a chamar uma ferramenta; a ferramenta
  nao pode ser convencida a devolver o que o perfil proibe.
- **Alternatives considered**: permissoes livres por area (adiado pela spec); filtrar so no
  prompt (rejeitado, inseguro).
- O perfil `contador` fica para a US7, junto com a area do contador.

## R6. Codigo de convite

- **Decision**: formato `CONV-` mais 6 caracteres de um alfabeto sem ambiguos
  (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), cerca de 887 milhoes de combinacoes. Guardado como hash
  SHA-256, como os codigos de acesso. Validade 7 dias, uso unico, cancelavel. Ate 5 tentativas
  erradas por telefone a cada 15 minutos.
- **Rationale**: curto para digitar e ditar, inviavel de adivinhar com o limite de tentativas,
  mesmo padrao de `src/auth.ts`.

## R7. Como o convidado entra

- **Decision**: pelo cadastro do painel, com campo opcional "codigo de convite". O cadastro ja
  confirma o numero pelo codigo de 6 digitos no WhatsApp, entao o membro entra com o numero
  comprovado. Com convite, o passo de plano e pagamento e pulado. Uma rota publica valida o
  convite antes e devolve o nome do titular para a tela mostrar "voce vai entrar na conta de X".
- **Rationale**: reaproveita o fluxo de ativacao existente. Entrar por mensagem no WhatsApp fica
  para depois.
- **Webhook**: um numero e atendido se estiver em `ALLOWED_NUMBERS` ou se for membro ativo de
  uma conta cujo titular esta em `ALLOWED_NUMBERS`. O numero de teste da Meta continua limitado a
  5 destinatarios cadastrados, o que vale ser dito no README (principio VII).

## R8. Numero que ja tem dados proprios

- **Decision**: um numero com lancamentos proprios pode entrar em outra conta. Os dados dele
  ficam guardados sob o proprio telefone e nao sao misturados; voltam a aparecer se ele sair da
  conta. A tela de entrada avisa isso antes de confirmar.
- **Rationale**: FR-006 (uma conta por vez) sem apagar nem fundir dados financeiros.

## R9. Remocao de membro

- **Decision**: `removed_at` no vinculo, sessoes do membro apagadas na hora, registros feitos por
  ele continuam na conta com a autoria. O titular nao pode ser removido; transferencia de
  titularidade fica fora desta entrega.

## R10. Custo de IA (principio IV)

- O prompt ganha uma linha com nome e perfil de quem fala (cerca de 30 tokens). Quatro
  ferramentas novas entram no bloco de ferramentas que ja usa cache. Impacto estimado abaixo de
  2% por conversa. Nenhuma chamada extra ao modelo.

# US2: Guarda e busca de documentos

## R11. Onde ficam os arquivos

- **Decision**: no disco, em uma pasta ao lado do banco: `data/assessor-arquivos/` para o banco
  real e `data/demo-arquivos/` para a demonstracao (derivada de `DB_PATH`). Cada arquivo fica em
  `<telefone da conta>/<id>-<8 hex aleatorios>.<ext>`. O SQLite guarda so os metadados.
- **Rationale**: principio VI (um servidor so, sem servico externo) e principio I (dados reais e
  de demonstracao separados). `data/` ja esta fora do Git. O sufixo aleatorio evita adivinhar o
  caminho de outro arquivo.
- **Alternatives considered**: blob no SQLite (banco cresce e o backup fica pesado); armazenamento
  de objetos (S3/R2), que fica para a troca de servidor junto com o PostgreSQL.

## R12. O que entra pelo WhatsApp

- **Decision**: o webhook passa a aceitar mensagens `document` (com `filename`, `mime_type` e
  `caption`) alem de `image`. Todo arquivo recebido e salvo na hora como **pendente**, sem custo de
  IA. Ele vira **guardado** quando o assessor chama `guardar_documento`, ou automaticamente quando
  a foto vira lancamento (R15). Pendente nao guardado em 24 horas e apagado pelo agendador.
- **Rationale**: o usuario pode mandar o arquivo e so na mensagem seguinte dizer "guarda esse".
  Manter o arquivo pendente permite isso sem guardar tudo para sempre (FR-007).
- **Limites**: ate 20 MB por arquivo (acima disso o assessor avisa e nao guarda); 1 GB por conta,
  com aviso a partir de 80% (FR-011). Formatos lidos pela IA: PDF e imagens JPG, PNG e WebP.
  Outros formatos (DOCX, XLSX) podem ser guardados, mas a IA so ve o nome e a legenda.

## R13. Quem classifica e da o titulo

- **Decision**: o proprio modelo, no turno em que o arquivo chega. O PDF ou a imagem vai junto
  com a mensagem (Gemini: `inlineData` com `application/pdf`; Claude: bloco `document` em base64).
  O modelo chama `guardar_documento` com pasta, titulo, descricao (1 a 3 frases com nomes, datas,
  valores e numero do documento) e data do documento. Sem pedido de guarda na legenda, ele diz o
  que parece ser e pergunta se guarda ("Parece o contrato de aluguel do apartamento. Guardo em
  Contratos?"); a resposta "sim" chama a ferramenta sobre o ultimo pendente.
- **Rationale**: nenhuma chamada extra de IA (principio IV); a classificacao usa o mesmo modelo que
  ja le notas fiscais. A pergunta deixa no historico o que o modelo viu, porque o arquivo nao volta
  a ser enviado nos turnos seguintes.
- **Custo**: so arquivos de ate 5 MB vao para o modelo; acima disso ele recebe nome e legenda.
  Um PDF de 12 paginas custa cerca de 3 mil tokens de entrada, uma vez.
- **Alternatives considered**: OCR local (dependencia pesada, pior que o modelo); segunda chamada
  de IA so para classificar (dobra o custo do turno).

## R14. Pastas

- **Decision**: pastas padrao fixas: `boletos`, `notas_fiscais`, `comprovantes`, `contratos`,
  `casa`, `carro`, `saude`, `trabalho`, `pessoais`, `outros`. O usuario move um documento entre
  elas no painel ou pedindo ao assessor. Pastas criadas pelo usuario ficam para depois.
- **Rationale**: a spec cita pastas criadas pelo usuario como entidade, mas a US2 so exige separar
  e mover. Pastas fixas deixam a classificacao mais certeira e a tela mais simples (principio VI).

## R15. Foto de cupom que vira lancamento

- **Decision**: quando a mensagem tem foto ou PDF e o turno cria uma transacao, o arquivo pendente
  e guardado automaticamente em `notas_fiscais` (ou `comprovantes`, se a forma for Pix ou
  transferencia), ligado a transacao, com titulo `<descricao> - <contraparte>`. Sem chamada extra
  ao modelo.
- **Rationale**: cenario 2 da US2 e FR-007; evita uma rodada de ferramenta so para guardar.

## R16. Busca

- **Decision**: tabela virtual FTS5 do proprio SQLite (`unicode61 remove_diacritics 2`) sobre
  titulo, descricao, nome original e pasta. A ferramenta `buscar_documentos` recebe a consulta em
  linguagem natural, o modelo extrai palavras-chave e periodo, e a busca devolve ate 8 candidatos
  ordenados por relevancia (bm25) e data. Com um so candidato claro, o modelo envia direto; com
  varios, lista ate 5 para o usuario escolher (cenario 3). Sem resultado, diz que nao achou.
- **Rationale**: testado neste ambiente: o better-sqlite3 do projeto tem FTS5 e acha "marco" em
  "março". Sem dependencia nova nem embeddings (principio VI e IV).
- **Alternatives considered**: busca por embeddings (custo por documento e outro servico);
  `LIKE` simples (nao ordena por relevancia nem ignora acento).

## R17. Devolver o arquivo na conversa

- **Decision**: `enviar_documento(id)` nao envia na hora: marca o arquivo para sair depois da
  resposta em texto. `runAgent` ganha um parametro opcional `enviarArquivo`; o webhook envia pelo
  WhatsApp (upload em `/{phone-number-id}/media` com `FormData` nativo do Node e mensagem
  `document` ou `image` com o media id); o terminal imprime o caminho do arquivo.
- **Rationale**: a resposta em texto chega antes do anexo, como numa conversa. `FormData` e `Blob`
  ja existem no Node 22, sem dependencia.
- **Alternatives considered**: enviar por link publico (exigiria URL assinada e o tunel aberto).

## R18. Permissao

- **Decision**: nova capacidade `documentos`, dada ao titular e ao acesso completo. Sem ela, a
  pessoa so ve documentos ligados a lancamentos que o perfil dela enxerga (o comprovante do gasto
  da Bia, por exemplo), e so a partir do lancamento. Os pendentes sao visiveis apenas para quem
  enviou. Toda leitura de arquivo passa pela mesma regra, na ferramenta e na API (principio I).
- **Rationale**: edge case da spec ("os resultados respeitam o perfil de quem pergunta") sem criar
  um perfil novo.

## R19. Painel

- **Decision**: a mesa de Tarefas (Davi) passa a cuidar tambem dos documentos: cargo "Projetos e
  documentos" e subtela `/tarefas/documentos` com pastas, busca, download, renomear, mover e
  excluir. Em Transacoes, o lancamento com comprovante mostra "ver comprovante". O download usa
  `fetch` com o token da sessao e abre o arquivo como `blob:`.
- **Rationale**: evita uma setima mesa e um assessor novo; o painel ja tem a sessao no cabecalho,
  nao em cookie, por isso nao da para usar link direto.
- **Fora desta entrega**: enviar arquivo pelo painel.

## R20. Exclusao

- **Decision**: excluir apaga o arquivo do disco e a linha do banco na hora. O lancamento ligado
  continua, sem comprovante. Exclusao pelo assessor exige confirmacao, como a de transacao.

## R21. Historico

- **Decision**: o historico guarda `[documento] nome.pdf: legenda` ou `[foto] legenda`, como hoje
  com fotos. O arquivo em si nao volta para o modelo nos turnos seguintes (R13).

## R22. Custo de IA (principio IV)

- Seis ferramentas novas no bloco com cache. PDFs ate 5 MB entram no turno em que chegam, uma vez.
  Busca e envio sao so texto. Estimativa: um usuario que guarda 10 documentos por mes acrescenta
  cerca de 30 mil tokens de entrada, menos de R$ 0,10 no modelo padrao.

# US3: Avisos proativos de financas

## R23. Avisos sem IA

- **Decision**: todo aviso proativo (vencimento, categoria acima do normal, lancamento recorrente,
  resumo da noite) e montado por codigo a partir do banco, com texto fixo. Nenhum aviso chama o
  modelo. A IA so entra quando a pessoa responde.
- **Rationale**: principio IV. Um aviso diario por conta com IA custaria mais que a meta de R$ 3
  por mes sozinho; com texto fixo o custo e zero. Principio VII: o numero do aviso vem do banco,
  nunca de uma estimativa do modelo.
- **Alternatives considered**: deixar o modelo redigir o aviso (mais natural, caro e sujeito a
  erro em valor).

## R24. Contas a pagar

- **Decision**: entidade propria `bills` (conta a pagar): descricao, valor opcional, vencimento,
  categoria, recorrencia mensal opcional e situacao. O aviso sai na vespera do vencimento, no
  horario de avisos da pessoa (padrao 9h). "Paguei o condominio" chama `pagar_conta`, que registra
  a despesa (com o valor informado ou o cadastrado) e, se for mensal, passa o vencimento para o
  mes seguinte (dia 31 vira o ultimo dia do mes, como nas parcelas). Fatura de cartao entra como
  conta a pagar mensal enquanto nao ha Open Finance (US8).
- **Rationale**: lembrete nao tem valor nem vira lancamento; conta a pagar fecha o ciclo "avisou,
  paguei, registrou". FR-012.
- **Alternatives considered**: reaproveitar `reminders` com campos extras (mistura duas coisas e
  complica a tela de Agenda).

## R25. Lancamentos recorrentes

- **Decision**: entidade `recurring` (recorrencia): tipo (despesa ou receita), valor, categoria,
  descricao, contraparte, forma de pagamento, frequencia (`diaria`, `semanal`, `mensal`), proxima
  data e situacao (`ativa`, `pausada`, `cancelada`). O agendador lanca a transacao quando a proxima
  data chega, grava `recurring_id` na transacao e avanca a data. Se o servidor ficou parado, lanca
  no maximo as ocorrencias dos ultimos 7 dias, uma por data, sem duplicar (indice unico em
  `recurring_id` + `occurred_on`).
- **Rationale**: FR-014 e cenario 3 ("toda segunda tem 89,90 da academia"). O indice unico garante
  "uma vez so" mesmo com dois ticks concorrentes.
- **Alternatives considered**: lancar todas as parcelas futuras de uma vez, como o parcelamento
  (uma assinatura nao tem fim conhecido, e cancelar exigiria apagar o futuro).

## R26. Categoria acima do normal

- **Decision**: uma vez por dia, no horario de avisos, para cada pessoa com o aviso ligado e com
  a capacidade `despesas`: compara o gasto de cada categoria do dia 1 ate hoje com o mesmo
  intervalo do mes anterior (dia 31 vira o ultimo dia do mes anterior). Avisa quando o atual for
  pelo menos 15% maior, a diferenca passar de R$ 50 e o mes anterior tiver ao menos R$ 100 na
  categoria. A projecao de fechamento e `gasto ate hoje / dias passados * dias do mes`. No maximo
  um aviso por categoria por semana ISO (registro em `notice_log`).
- **Rationale**: FR-013 e cenario 2. Os pisos de R$ 50 e R$ 100 evitam aviso de "Padaria subiu
  40%" por R$ 6, que faz a pessoa desligar o aviso.
- **Alternatives considered**: media dos ultimos 3 meses (mais estavel, mas a spec pede o mes
  anterior e e mais facil de conferir).

## R27. Resumos da manha e da noite

- **Decision**: o resumo da manha existente passa a ser uma preferencia (`resumo_manha`, ligado
  para o titular, como hoje). O resumo da noite (`resumo_noite`, desligado por padrao, 21h) conta o
  que entrou na conta no dia, so nas areas que o perfil enxerga: gastos (quantidade e total),
  lembretes e tarefas criados, documentos guardados. Membros podem ligar os dois para si.
- **Rationale**: FR-015, cenario 5, e a pendencia da US1 (resumo por membro, R4). Desligado por
  padrao evita mandar mensagem nao pedida.

## R28. Preferencias por pessoa

- **Decision**: tabela `notice_prefs` por telefone de quem recebe (membro, nao conta), um registro
  por tipo: `vencimentos`, `categoria`, `recorrentes`, `resumo_manha`, `resumo_noite`. Campos:
  ligado e hora. Padroes: titular com `vencimentos`, `categoria`, `recorrentes` e `resumo_manha`
  ligados; membro com tudo desligado ate ligar. Sem linha, vale o padrao. A pessoa muda pelo
  WhatsApp ("para de me avisar de categoria", "me manda o resumo da noite as 22h") ou no painel.
- **Rationale**: FR-016 e cenario 6. Membro desligado por padrao: entrar numa conta nao deve
  encher o WhatsApp de ninguem.

## R29. Aviso que nao pode ser entregue

- **Decision**: avisos e lembretes saem por `sendNotice` (modelo aprovado se configurado). Se a
  Meta recusar (por exemplo, fora da janela de 24 horas sem modelo), o texto vai para
  `pending_notices` e o lembrete avanca normalmente. Na proxima mensagem da pessoa, o webhook
  manda os pendentes ("Avisos que ficaram para depois:") antes da resposta do assessor. Pendente
  com mais de 7 dias e descartado.
- **Rationale**: edge case da spec. Corrige o comportamento atual, em que o lembrete que falha e
  reenviado a cada 30 segundos indefinidamente.

## R30. Nao repetir aviso

- **Decision**: `notice_log` com `(phone, tipo, chave)` unico. Chaves: `vencimento:<bill_id>:<data>`,
  `categoria:<nome>:<ano-semana>`, `recorrente:<recurring_id>:<data>`, `resumo_manha:<data>`,
  `resumo_noite:<data>`. O registro e gravado antes do envio, numa transacao; se a chave ja
  existir, o aviso nao sai.
- **Rationale**: SC-004 ("nenhum aviso em duplicidade") mesmo com o agendador rodando a cada
  30 segundos.

## R31. Comparativo com o mes anterior

- **Decision**: ferramenta `comparar_meses` (mes atual contra o anterior, ou um mes informado):
  total de despesas, diferenca em valor e percentual, e as tres categorias com maior variacao
  absoluta. Mes corrente compara ate o mesmo dia (R26). Sem receitas para quem nao tem a
  capacidade.
- **Rationale**: cenario 4; consulta de leitura, sem tabela nova.

## R32. Permissoes

- **Decision**: contas a pagar e recorrencias de despesa exigem `despesas`; recorrencia de receita
  exige `receitas`; avisos de categoria e vencimento so saem para quem tem `despesas`; o resumo
  da noite so conta areas visiveis. Preferencias de aviso sao pessoais e qualquer perfil muda as
  proprias. Tudo pelo `repoDoContexto` e por `exigir`, como na US1.

## R33. Painel

- **Decision**: em Financas, a tela nova **Contas e recorrencias** (`/financas/contas`) lista
  contas a pagar (proximas, vencidas, pagas no mes) e recorrencias, com criar, editar, pagar,
  pausar e cancelar. Em Operacao, a tela **Avisos** (`/operacao/avisos`) liga e desliga cada tipo
  e escolhe o horario, para quem esta logado.
- **Rationale**: contas e recorrencias sao dinheiro (mesa do Bento); avisos valem para todas as
  mesas (Otto coordena).

## R34. Custo e carga (principio IV)

- Nove ferramentas novas no bloco com cache, cerca de 1.500 tokens a mais, pagos uma vez por
  cache. Avisos sem IA. O calculo de categoria roda uma vez por dia por pessoa com o aviso ligado,
  com duas consultas agregadas por mes; para mil contas, milissegundos.
# US4: Google Agenda

## R35. Agenda de quem e

- **Decision**: a conexao com o Google e por pessoa (telefone do membro), nao por conta. Cada um
  conecta a propria conta Google e os compromissos que pede entram no calendario principal
  (`primary`) dele. Exige a capacidade `agenda`.
- **Rationale**: agenda e pessoal. Na conta compartilhada, o socio nao deve ver nem escrever no
  calendario do titular (principio I).

## R36. Autorizacao e escopo

- **Decision**: OAuth 2.0 do Google no fluxo de servidor web, com `access_type=offline` e
  `prompt=consent` para receber o refresh token, e um unico escopo:
  `https://www.googleapis.com/auth/calendar.events` (ler e escrever eventos). O e-mail da conta
  vem do `id_token` com o escopo `openid email`, so para mostrar qual conta esta ligada.
- **Rationale**: FR-017 pede permissao limitada ao calendario. `calendar.events` le eventos para
  achar conflito e cria, move e apaga, sem acesso a configuracoes, contatos ou Gmail.
- **Alternatives considered**: `calendar` completo (amplo demais); `calendar.events.owned` (nao le
  eventos de agendas compartilhadas para conflito, e a maioria das pessoas so usa a principal;
  reavaliar se a verificacao do Google pedir).

## R37. Como a pessoa conecta

- **Decision**: dois caminhos que terminam no mesmo fluxo:
  - no painel, Agenda > "Conectar Google Agenda": a API devolve a URL do Google com um `state`
    aleatorio guardado como hash, ligado ao telefone de quem esta logado, valido por 10 minutos;
  - no WhatsApp, a ferramenta `conectar_google_agenda` gera um link de uso unico
    `<PAINEL_URL>/api/google/conectar/<token>`, valido por 15 minutos, que cria o `state` e
    redireciona para o Google sem pedir login.
  O retorno (`/api/google/retorno`) e publico, confere o `state` (uso unico, dentro da validade),
  troca o `code` pelos tokens e mostra uma pagina simples "Google Agenda conectada, pode fechar".
- **Rationale**: a pessoa que pede pelo WhatsApp quase nunca esta logada no painel. O `state` evita
  que alguem ligue a propria conta Google ao telefone de outra pessoa (CSRF).

## R38. Guarda do token

- **Decision**: o refresh token e cifrado com AES-256-GCM (chave de 32 bytes em base64 em
  `GOOGLE_TOKEN_KEY`, IV aleatorio por registro) antes de ir para o banco. O access token fica so
  em memoria, com a validade devolvida pelo Google, e e renovado quando faltar menos de 1 minuto.
- **Rationale**: o refresh token da acesso continuo ao calendario da pessoa; vazamento do arquivo
  do banco nao pode bastar para usa-lo (principio I).

## R39. Chamadas ao Google

- **Decision**: REST direto com `fetch`, sem SDK, como ja e feito com o Gemini. Endpoints:
  `oauth2.googleapis.com/token` (troca e renovacao), `oauth2.googleapis.com/revoke` (desconectar)
  e `www.googleapis.com/calendar/v3/calendars/primary/events` (listar, criar, mover com `PATCH`,
  apagar). Datas com `dateTime` e `timeZone` = `TIMEZONE`. Tempo limite de 10 segundos por chamada.
- **Rationale**: principio VI; o SDK `googleapis` traz dezenas de MB para quatro chamadas.

## R40. Criar compromisso

- **Decision**: ferramenta `criar_compromisso` com titulo, inicio, duracao (padrao 60 minutos),
  convidados por e-mail, `com_videochamada` e `lembrar_minutos_antes` (padrao 60). Antes de criar,
  lista os eventos do intervalo; havendo sobreposicao e sem `confirmar_conflito: true`, devolve o
  conflito para o modelo perguntar (cenario 3). Videochamada usa `conferenceData.createRequest`
  com `hangoutsMeet` e `conferenceDataVersion=1`; convidados recebem convite com
  `sendUpdates=all`. Junto, cria o lembrete interno do WhatsApp ligado ao evento
  (`reminders.google_event_id`), para avisar no horario mesmo fora do app do Google.
- **Rationale**: cenarios 1 e 3. O lembrete pelo WhatsApp e o que o produto entrega a mais que o
  proprio Google; ligado ao evento, ele acompanha remarcacao e cancelamento.

## R41. Sem horario, sem conexao

- **Decision**: a ferramenta exige data e hora (schema); o prompt manda perguntar antes. Sem conta
  Google conectada, `criar_compromisso` cria so o lembrete interno, como hoje, e a resposta inclui
  o link de conexao (cenario 5). Com a integracao desligada no servidor (sem `GOOGLE_CLIENT_ID`),
  a resposta diz que a agenda do Google nao esta disponivel (principio VII).

## R42. Consultar, remarcar e cancelar

- **Decision**: `consultar_agenda(data_inicio, data_fim, busca?)` devolve os eventos com o id do
  Google, titulo, horario e convidados; `remarcar_compromisso(id, novo_inicio, duracao?)` faz
  `PATCH` com `sendUpdates=all` (os convidados sao avisados pelo proprio Google, cenario 4) e move o
  lembrete ligado; `cancelar_compromisso(id, confirmado)` apaga com confirmacao. Para "a reuniao de
  sexta pode virar 15h?", o modelo consulta a sexta, e com um so evento compativel remarca; com
  varios, pergunta qual.
- **Rationale**: o modelo ja faz esse padrao com transacoes e documentos.

## R43. Desconectar e falhas

- **Decision**: `desconectar_google_agenda` (com confirmacao) e o botao no painel chamam o
  `revoke` do Google e apagam a linha de `google_accounts` (cenario 6). Se o Google responder
  `invalid_grant` (acesso revogado pela pessoa ou expirado), a conta vira `expirada`, o pedido em
  curso vira lembrete interno e a pessoa recebe uma vez o aviso com o link para reconectar (chave
  `google_expirada:<data>` no `notice_log`).
- **Rationale**: edge case da spec ("token do Google expirado no meio de um pedido").

## R44. Resumo da manha

- **Decision**: o resumo da manha (US3) passa a listar os eventos do dia do Google de quem tem a
  conta conectada, em ordem de horario. Falha do Google nao impede o resumo: ele sai sem os eventos
  e com a linha "Nao consegui ler o Google Agenda agora".
- **Rationale**: FR-020, sem tornar o resumo dependente de servico externo.

## R45. Configuracao e limites do Google

- **Decision**: novas variaveis `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` e
  `PAINEL_URL` (base publica do painel, usada no `redirect_uri` `<PAINEL_URL>/api/google/retorno`).
  Sem elas, tudo funciona como hoje e o painel mostra "Google Agenda nao configurada neste
  servidor". O README explica criar o projeto no Google Cloud, a tela de consentimento e o
  redirect.
- **Limites que o README precisa dizer** (principio VII): com o app em modo de teste, so os
  e-mails cadastrados como testadores conseguem conectar e o refresh token vence em 7 dias; para
  uso aberto, o escopo `calendar.events` e sensivel e exige a verificacao do Google.

## R46. Custo e testes

- Seis ferramentas novas no bloco com cache. A API do Google Calendar nao cobra por chamada dentro
  da cota padrao. Nos testes, `fetch` simulado para os endpoints do Google, como ja e feito com a
  Meta e o Gemini.