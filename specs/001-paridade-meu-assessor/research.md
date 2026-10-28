# Research: Paridade com o Meu Assessor

Decisoes por historia. R1 a R10 sao da US1 (conta compartilhada), R11 a R22 da US2 (documentos)
R23 a R34 da US3 (avisos proativos), R35 a R46 da US4 (Google Agenda), R47 a R58 da US5 (pagina publica
de agendamento) e R59 a R70 da US6 (mensagens a outras pessoas) e R71 a R80 da US7 (area do contador),
R81 a R90 da US8 (extrato bancario, com o Open Finance adiado), todas implementadas; R91 a R100
sao da US9 (cobranca por Pix, com a nota fiscal adiada). A US9 acrescenta a sua secao
aqui.

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

# US5: Pagina publica de agendamento

## R47. De quem e a pagina

- **Decision**: a pagina e de uma pessoa (o membro que atende), exige a capacidade `agenda` e o
  Google Agenda conectado (US4). Os horarios livres vem do calendario principal dela, e o
  agendamento vira evento nele.
- **Rationale**: a spec diz que a US5 depende da US4. Usar o calendario real e o unico jeito de nao
  oferecer um horario que ja esta ocupado por algo marcado fora do produto (FR-022, FR-023).
- **Sem Google conectado**: a pagina nao pode ser ativada, e a tela diz por que (principio VII).

## R48. Endereco publico

- **Decision**: `<PAINEL_URL>/agendar/<slug>`, com `slug` aleatorio de 10 caracteres
  (`[a-z0-9]`). A pagina e uma rota publica do painel Vue; os dados vem de
  `GET /api/agendar/:slug` e a reserva de `POST /api/agendar/:slug`, num plugin publico como o do
  retorno do Google. A pessoa pode gerar um novo `slug` (o antigo para de funcionar).
- **Rationale**: um nome previsivel (`/agendar/wesley`) permitiria descobrir paginas de outras
  pessoas. Trocar o `slug` resolve um link que vazou.

## R49. Configuracao

- **Decision**: por pagina: nome exibido (o titulo da pagina, ex.: "Julia Andrade"), duracoes
  oferecidas (entre 15, 30, 45, 60, 90 e 120 minutos), dias da semana, janela unica de atendimento
  (`HH:mm` a `HH:mm`, a mesma para os dias escolhidos), antecedencia minima em horas (padrao 12),
  horizonte em dias (padrao 30, maximo 90) e situacao (ativa ou pausada).
- **Rationale**: FR-021 com o menor formulario que cobre o caso comum de consultorio. Janelas
  diferentes por dia ficam para depois.

## R50. Horarios livres

- **Decision**: para a duracao escolhida e um dia, os inicios possiveis andam de 15 em 15 minutos
  (duracao de 15) ou de 30 em 30 (as demais), dentro da janela, a partir de `agora + antecedencia`,
  e saem os que se sobrepoem a: eventos do Google com hora (os de dia inteiro nao bloqueiam) e
  agendamentos da pagina ainda nao cancelados. A API devolve so `inicio` e `fim` em UTC; nunca
  titulo, convidados ou qualquer dado dos outros compromissos (FR-022).
- **Rationale**: a lista do Google e uma chamada por dia consultado; o navegador pede um dia por vez.

## R51. Fuso do cliente

- **Decision**: a API trabalha em UTC; a pagina mostra em `Intl.DateTimeFormat().resolvedOptions().timeZone`
  do navegador do cliente, com a indicacao "horarios no seu fuso (America/Lisbon)" quando for
  diferente de `TIMEZONE`. O evento e o lembrete do dono usam `TIMEZONE`.
- **Rationale**: edge case da spec.

## R52. Dois clientes no mesmo horario

- **Decision**: a reserva comeca com uma transacao sincrona no SQLite que confere sobreposicao com
  agendamentos `reservando`, `agendado` ou `confirmado` da mesma pagina e grava a linha como
  `reservando`. So depois chama o Google (confere conflito de novo e cria o evento). Se o Google
  recusar ou o horario tiver sido ocupado, a linha e apagada e a resposta e `409` "Esse horario
  acabou de ser ocupado". Linhas `reservando` com mais de 2 minutos sao apagadas pela limpeza.
- **Rationale**: FR-023 e cenario 5. Como o better-sqlite3 e sincrono, o segundo pedido ve a linha
  `reservando` do primeiro antes de qualquer `await`; nao precisa de trava extra.

## R53. Dados do cliente e consentimento

- **Decision**: nome (2 a 80 caracteres), e-mail valido e WhatsApp (10 a 15 digitos), mais a
  caixa "Aceito receber a confirmacao deste horario pelo WhatsApp" obrigatoria. O e-mail entra como
  convidado do evento (o Google manda o convite). Campo escondido contra robo e limite de 5 reservas
  por IP por hora e 3 por WhatsApp por dia.
- **Rationale**: o cliente nao tem conta; o consentimento e o que autoriza o assessor a escrever
  para ele (FR-024). Os limites evitam encher a agenda de alguem com reservas falsas.

## R54. Confirmacao na vespera

- **Decision**: o agendador manda ao cliente, as 18h da vespera, uma mensagem com dia, hora e o
  nome de quem atende, pedindo "1 para confirmar, 2 se precisar remarcar, PARAR para nao receber
  mais". Sai pelo modelo aprovado (`WHATSAPP_NOTICE_TEMPLATE`), porque o cliente quase nunca
  conversou com o numero nas ultimas 24 horas. Sem modelo configurado, a confirmacao nao e enviada:
  o agendamento fica marcado "confirmacao nao enviada" e o dono e avisado (principio VII).
- **Rationale**: FR-024 e cenario 3, dentro da regra da Meta.

## R55. Respostas do cliente

- **Decision**: o webhook passa a aceitar, alem dos numeros autorizados, mensagens de um numero com
  agendamento futuro ou de ate 1 dia atras. Essas mensagens nunca vao para o assessor de IA nem
  veem dados do dono: um interpretador simples trata `1`/`sim`/`confirmo` (confirma), `2`/`remarcar`
  (avisa o dono), um numero de opcao quando ha remarcacao em aberto e `PARAR` (marca o opt-out e
  para de escrever). Qualquer outra coisa recebe uma resposta fixa com as opcoes.
- **Rationale**: principio I: o cliente nao e usuario da conta. Principio IV: sem custo de IA.

## R56. Remarcar pelo dono

- **Decision**: ferramenta `remarcar_agendamento` (com `consultar_agendamentos` antes, como na
  agenda). O assessor calcula ate tres horarios livres a partir do dia seguinte, manda ao cliente
  "Julia precisou remarcar. Opcoes: 1) qui 27/08 19:00 2) ... 3) ... Responda com o numero" e
  guarda as opcoes no agendamento (`remarcando`). Quando o cliente responde, o evento do Google e
  movido, o lembrete do dono acompanha, o cliente recebe a confirmacao e o dono recebe o aviso
  "Camila escolheu quinta, 27, as 19:00". Se nenhuma opcao servir ("0"), o dono e avisado.
- **Rationale**: cenario 4 da spec.

## R57. Avisos ao dono

- **Decision**: novo tipo de aviso `agendamentos` (ligado por padrao para quem tem pagina ativa):
  novo agendamento, confirmacao, pedido de remarcacao, escolha de nova data e falha de envio ao
  cliente. Usa a fila e o registro da US3.

## R58. Custo e privacidade

- Pagina, reserva e respostas do cliente sem IA. Duas ferramentas do assessor usam o modelo como
  qualquer outra. Dados do cliente ficam na conta do dono e somem 90 dias depois do horario.

# US6: Mensagens a outras pessoas

## R59. Quem e o contato

- **Decision**: tabela `contacts` por conta, com nome e telefone. O assessor acha o contato pelo
  nome ("o Joao"); sem cadastro, pede o numero ao usuario. Contato compartilhado pelo WhatsApp
  (mensagem do tipo `contacts`) vira texto para o modelo com nome e numero, para o usuario nao
  precisar digitar. O contato e salvo no primeiro envio confirmado.
- **Rationale**: "lembra o Joao" so funciona se o assessor souber quem e o Joao. Pedir o numero uma
  vez e o caminho mais curto; o cartao de contato e o jeito natural do WhatsApp.
- **Alternatives considered**: ler a agenda do celular (impossivel pela API da Meta); Google
  Contatos (escopo novo e sensivel, contra R40).

## R60. Confirmacao antes de enviar

- **Decision**: a ferramenta `mensagem_para_contato` funciona como as de cancelar: com
  `confirmado` falso devolve a previa exata (destinatario, texto final e quando/recorrencia) e nao
  envia nada; so com `confirmado` verdadeiro grava e envia ou agenda. Vale para todo envio, nao so
  o primeiro.
- **Rationale**: FR-025 e cenario 1. Confirmar sempre e mais simples que lembrar quem ja foi
  confirmado, e evita mandar texto errado em nome do usuario.

## R61. Formato da mensagem

- **Decision**: texto fixo em volta do pedido: `Oi, {contato}! Aqui e o assessor de {usuario}.
  {texto} Para nao receber mais mensagens do assessor, responda PARAR.` `{usuario}` e o nome de
  quem pediu (o membro, nao o titular). O `{texto}` vem do modelo, com ate 500 caracteres.
- **Rationale**: FR-026 e cenario 2. A identificacao e o PARAR sao de codigo; o modelo nao pode
  esquecer nem reescrever.

## R62. Janela de 24 horas

- **Decision**: o envio sai por `sendNotice`: com `WHATSAPP_NOTICE_TEMPLATE` usa o modelo
  aprovado, sem ele tenta texto livre, que a Meta so aceita se o contato escreveu nas ultimas 24
  horas. Recusa vira situacao `falhou` e o usuario recebe o motivo. Sem modelo configurado, a
  previa ja avisa que o envio pode nao chegar.
- **Rationale**: assumption da spec e principio VII. Reaproveita o modelo da US3 (um parametro de
  texto), sem modelo novo para aprovar.

## R63. Lista de quem pediu para parar

- **Decision**: a tabela `client_optouts` da US5 vira a lista unica de numeros que responderam
  PARAR ao assessor, de qualquer conta, para agendamento e para contatos. Antes de cada envio o
  numero e conferido; na lista, a ferramenta responde que a pessoa pediu para nao receber e nada
  sai. Um PARAR cancela os envios recorrentes para aquele numero e o usuario e avisado.
- **Rationale**: FR-027, cenario 3 e SC-007 (zero mensagens). Uma lista so: para o contato tanto
  faz se a mensagem veio de uma pagina de agendamento ou de um pedido.

## R64. Limites por conta

- **Decision**: ate 20 mensagens a contatos por conta por dia e ate 3 por contato por dia,
  contando as recorrentes. Passou do limite, o envio pedido e recusado com o motivo; o recorrente
  pula aquele dia e o usuario e avisado uma vez.
- **Rationale**: FR-028. Muita mensagem a quem nao conhece o numero leva a bloqueios e derruba a
  qualidade do numero na Meta.

## R65. Situacao do envio

- **Decision**: cada mensagem enviada guarda o id da Meta (`wamid`). O webhook passa a ler os
  `statuses` (`sent`, `delivered`, `read`, `failed`) e atualiza a mensagem. Falha avisa o usuario na
  hora; "o Joao respondeu?" consulta a situacao pela ferramenta `consultar_mensagens_contato`.
  Sem resposta nao gera aviso ativo.
- **Rationale**: a historia pede "entregue, respondido, sem resposta". Avisar cada leitura seria
  ruido; a falha e a resposta sao o que importa.

## R66. Resposta do contato

- **Decision**: mensagem de um numero que nao e da casa, sem agendamento ativo e com mensagem
  enviada nos ultimos 7 dias (ou recorrente ativo) vai para um interpretador sem IA: `PARAR`
  registra o opt-out e responde uma ultima vez; qualquer outra coisa e repassada a quem pediu o
  envio, literal e cortada em 500 caracteres (`💬 Joao respondeu: ...`), e o contato recebe uma vez
  por dia `Recebido! Vou repassar para {usuario}.`. Agendamento ativo tem a vez (US5).
- **Rationale**: cenario 5 pede um resumo; repassar o texto literal e o resumo mais fiel, sem
  custo de IA (principio IV) e sem passar a fala de um terceiro pelo modelo (principio I). O
  contato nunca conversa com o assessor nem ve dados da conta.
- **Alternatives considered**: resumir com o modelo (custo e dado de terceiro no modelo).

## R67. Envio recorrente e agendado

- **Decision**: o pedido grava um envio (`contact_sends`) com a primeira data e hora e a
  recorrencia (`diario`, `semanal`, `mensal` ou nenhuma), como os lembretes. O agendador manda os
  vencidos e calcula o proximo com `nextOccurrence`. "Para de cobrar o Joao" usa
  `cancelar_mensagem_contato` (por id, com confirmacao quando houver mais de um).
- **Rationale**: cenario 4 e o exemplo "todo dia 5". Mesmo modelo dos lembretes, ja testado.

## R68. Quem pode pedir

- **Decision**: a capacidade `agenda`: titular, membro completo e membro de agenda e tarefas.
  Quem so registra gastos nao manda mensagem em nome da conta.
- **Rationale**: "lembra o Joao" e um lembrete para outra pessoa. Perfis sao fixos nesta versao.

## R69. Painel

- **Decision**: na mesa de Agenda, bloco "Mensagens para outras pessoas": envios agendados e
  recorrentes com cancelar, e as ultimas mensagens com situacao e resposta. Envio novo so pelo
  WhatsApp nesta entrega.
- **Rationale**: conferir e parar pelo painel atende ao principio V; criar pelo painel repetiria a
  previa e a confirmacao sem ganho real agora.

## R70. Custo e privacidade

- Uma chamada de ferramenta por pedido; envio, agendador, situacao e respostas sem IA. Texto das
  respostas guardado por 90 dias; o contato fica ate o usuario apagar. O numero do contato nunca
  aparece para outras contas.

# US7: Area do contador

## R71. Vinculo do contador

- **Decision**: tabela propria `accountant_access` (conta do titular, telefone do contador, quando
  entrou, ultimo acesso, revogado em). Nao usa `account_members`: o contador nao vira membro, nao
  entra na conversa e pode atender varias contas ao mesmo tempo.
- **Rationale**: FR-006 liga um WhatsApp a uma so conta, o que serve para membros e impediria um
  contador com varios clientes. O vinculo separado tambem deixa claro, no codigo, que nenhuma rota
  existente de membro vale para ele.
- **Alternatives considered**: perfil `contador` em `account_members` (quebra FR-006 e faria o
  contador passar por `resolverContexto`, com risco de herdar capacidades).

## R72. Convite proprio

- **Decision**: tabela `accountant_invites` com codigo `CONT-XXXXXX` (mesmo alfabeto do `CONV-`),
  validade de 7 dias, uso unico, ate 3 pendentes por conta e o mesmo limite de tentativas erradas
  de `invite_attempts`. So o titular gera (capacidade `acessos`), pelo painel ou pelo WhatsApp
  ("gera um convite para o meu contador").
- **Rationale**: "convida o contador com um codigo proprio". O prefixo diferente evita que um
  codigo de contador vire, por engano, acesso de membro.

## R73. Como o contador entra

- **Decision**: com conta no painel (cadastro e ativacao pelo WhatsApp como qualquer usuario). No
  cadastro, o campo de convite aceita `CONT-`: sem plano, o codigo fica pendente e vira vinculo na
  ativacao, como o `CONV-`. Quem ja tem conta digita o codigo na tela Clientes.
- **Rationale**: reaproveita senha, codigo de ativacao e sessao da US1. O contador nao paga: o
  acesso e um beneficio da conta do cliente.

## R74. Isolamento

- **Decision**: o contador continua com o proprio contexto (a propria conta, talvez vazia). A area
  do contador e um conjunto separado de rotas `/api/contador/...`, so de leitura, e cada pedido
  confere no banco se ha vinculo ativo entre o contador e a conta pedida. Nenhuma rota de escrita
  recebe uma conta de cliente.
- **Rationale**: FR-029, cenario 3 e FR-031. Conferir o vinculo a cada pedido faz a revogacao valer
  na hora (cenario 4), sem cache. O contador nao chega a nenhuma outra rota da conta do cliente,
  entao nao ha o que esconder na tela: a acao nao existe.

## R75. O que entra no dossie

- **Decision**: por mes: todas as despesas e receitas (data, tipo, valor, categoria, descricao,
  contraparte, forma de pagamento, parcela, quem lancou) e os documentos guardados das pastas
  `notas_fiscais`, `comprovantes` e `boletos`, mais qualquer documento ligado a um lancamento do
  mes. Saude, pessoais, casa, carro, contratos, trabalho e outros ficam de fora, a menos que sejam
  comprovante de um lancamento. Meses disponiveis: os que tem lancamento ou documento.
- **Rationale**: FR-029 fala em lancamentos e documentos fiscais. Uma identidade guardada na pasta
  Pessoais nao e assunto do contador.

## R76. Pacote do mes

- **Decision**: ZIP montado no servidor, sem dependencia nova: `node:zlib` (deflate e `crc32`, que
  o Node 22 ja tem) e um escritor de ZIP de poucas linhas em `src/zip.ts`. Dentro:
  `lancamentos-AAAA-MM.csv` (separador `;`, decimal com virgula, BOM UTF-8 para o Excel abrir com
  acento) e uma pasta por pasta de documento, com nomes sem repeticao. Limite de 200 MB por
  pacote: acima disso, o ZIP leva a planilha e um `LEIA-ME.txt` listando os arquivos que ficaram
  de fora, que continuam baixaveis um a um.
- **Rationale**: FR-030 e SC-008 (300 lancamentos em menos de 30 s). Principio VI: o formato ZIP
  sem senha e simples o bastante para nao justificar uma biblioteca.
- **Alternatives considered**: `archiver` ou `jszip` (dependencia nova sem ganho real).

## R77. Painel do contador

- **Decision**: rota `/contador` com a lista de clientes e o campo para usar um codigo; dentro de
  um cliente, seletor de mes, totais, lista de lancamentos, lista de documentos (abrir um a um) e
  "Baixar o mes". `GET /api/me` passa a trazer `clientes` (contas em que a pessoa e contador).
  Quem so e contador (sem plano proprio) entra direto em `/contador`; o menu mostra "Clientes"
  para quem tem pelo menos um.
- **Rationale**: cenario 1: o contador ve so a area do contador do titular.

## R78. Lado do titular

- **Decision**: em Operacao > Acessos, secao "Contador": gerar codigo (com texto pronto para
  mandar), convites pendentes com cancelar, contadores com ultimo acesso e "Revogar". Pelo WhatsApp:
  ferramenta `convidar_contador`; `listar_acessos` mostra os contadores; `remover_acesso` tambem
  revoga contador pelo nome.
- **Rationale**: FR-031 e consistencia com a US1 (FR-005).

## R79. Ultimo acesso

- **Decision**: `last_seen_at` atualizado quando o contador abre um mes ou baixa o pacote, mostrado
  ao titular.
- **Rationale**: o titular sabe se o contador esta usando o acesso, e decide revogar com base nisso.

## R80. Custo e privacidade

- Sem IA na area do contador. Arquivos lidos do disco so na hora do download. Revogar nao apaga
  nada da conta, so o vinculo.

# US8: Extrato bancario (Open Finance adiado)

## R81. Sem parceiro por enquanto

- **Decision**: nao contratar agregador de Open Finance nesta entrega. A US8 entrega a importacao
  de extrato OFX com tudo o que a historia pede de regra (categoria, contraparte, sem duplicar,
  estorno, fatura do cartao, so leitura). Ficam para quando houver contrato: FR-032 (conexao por
  parceiro autorizado), FR-034 (aviso de consentimento) e os cenarios 1 e 4. A tela e o README dizem
  que a conexao automatica com bancos ainda nao existe.
- **Rationale**: os precos citados publicamente para agregadores comecam perto de R$ 2.500 por mes
  fixos (Pluggy), sem confirmacao oficial. Sem base de usuarios, isso estoura a meta do principio
  IV. Decisao do dono do produto em 2026-10-27.
- **Depois**: o parceiro entra como outra origem de movimentacoes; a importacao (R85 a R87) e a
  mesma. Opcoes avaliadas: Pluggy (~R$ 2.500/mes), Belvo (~R$ 6.000/mes), Tecnospeed (R$ 1.500 de
  adesao e R$ 540/mes), todos a cotar.

## R82. Formato OFX

- **Decision**: leitor proprio em `src/ofx.ts`, sem dependencia: aceita OFX 1.x (SGML, tags sem
  fechamento) e 2.x (XML), le o cabecalho de codificacao (`CHARSET:1252` vira latin1, o resto UTF-8),
  extrai a instituicao (`ORG`, `BANKID`), a conta (`BANKACCTFROM` com `ACCTID`, ou `CCACCTFROM` para
  cartao), o periodo (`DTSTART`, `DTEND`), o saldo (`LEDGERBAL`) e cada `STMTTRN` (`TRNTYPE`,
  `DTPOSTED`, `TRNAMT`, `FITID`, `NAME`, `MEMO`, `PAYEE`). Arquivo ate 5 MB; sem nenhum `STMTTRN`
  valido, recusa com o motivo.
- **Rationale**: quase todo banco brasileiro exporta extrato e fatura em OFX; o formato e simples o
  bastante para nao justificar biblioteca (principio VI). CSV fica de fora: cada banco tem um layout.

## R83. Como o extrato chega

- **Decision**: pelo painel, Financas > Extratos > "Importar extrato" (envio do arquivo); pelo
  WhatsApp, mandando o `.ofx` e pedindo "importa esse extrato", com a ferramenta `importar_extrato`
  lendo o arquivo pendente do turno (US2). Exige `despesas` e `receitas` (o extrato traz os dois);
  so gastos recebe "Sem permissao". O arquivo nao e guardado: depois da importacao, o pendente do
  WhatsApp e apagado.
- **Rationale**: os dois canais da constituicao (principio V), reaproveitando o caminho de arquivos
  da US2.

## R84. Conta de origem

- **Decision**: `bank_accounts` por conta do produto, identificada por SHA-256 de `BANKID` +
  `ACCTID` (so os 4 ultimos digitos ficam legiveis). Tipo `corrente` ou `cartao` pelo bloco do OFX.
  Nome sugerido pelo banco e editavel. Guarda o saldo do ultimo extrato e, no cartao, os dias de
  fechamento e vencimento informados pelo usuario.
- **Rationale**: o mesmo arquivo importado de novo cai na mesma conta; o numero completo da conta
  nao precisa ficar no banco de dados (principio I).

## R85. Movimentacao vira lancamento

- **Decision**:
  - Corrente: valor negativo = despesa, positivo = receita. Cartao: negativo = compra (despesa);
    positivo = pagamento da fatura (ignorado) ou estorno (R87).
  - Ignorados e contados no resultado: pagamento de fatura na corrente (contaria duas vezes com as
    compras do cartao) e aplicacao ou resgate de investimento (dinheiro do proprio usuario mudando
    de lugar).
  - Contraparte: `NAME` ou `PAYEE`, limpo de prefixos do banco ("PIX ENVIADO", "COMPRA CARTAO",
    "PAG*", datas e codigos), em capitalizacao normal.
  - Categoria: primeiro a que o usuario mais usa para a mesma contraparte; senao, regras por
    palavra (iFood > Alimentacao, Uber e 99 > Transporte, posto > Combustivel, farmacia e drogaria >
    Saude, mercado e atacado > Mercado, Netflix e Spotify > Assinaturas, tarifa > Tarifas bancarias,
    juros e IOF > Juros e encargos, salario > Salario); senao "Outros".
  - Forma de pagamento: `credito` no cartao; `pix`, `debito` ou `boleto` pelo tipo e pela descricao
    na corrente.
  - Lancamento importado tem `source = 'extrato'`, `external_id` (o `FITID`) e `bank_account_id`;
    `created_by` e quem importou. Corrigir categoria e contraparte funciona como em qualquer
    lancamento.
- **Rationale**: FR-033 e principio V (categoria e contraparte na entrada), sem IA (principio IV).

## R86. Sem duplicar

- **Decision**: `(phone, bank_account_id, external_id)` unico: o mesmo arquivo, ou um periodo que
  se sobrepoe, nao cria nada de novo. Antes de criar, procura lancamento manual da conta sem
  `external_id`, do mesmo tipo, mesmo valor e data a ate 2 dias; achando, liga (o manual ganha
  `external_id` e `bank_account_id` e mantem categoria e descricao do usuario), escolhendo o de data
  mais proxima quando ha mais de um.
- **Rationale**: cenario 2 e SC-009. Banco sem `FITID` estavel e raro; quando faltar, o id vira
  data + valor + descricao.

## R87. Estorno

- **Decision**: credito no cartao que nao e pagamento procura a compra do mesmo cartao com o mesmo
  valor nos 90 dias anteriores; achando, a compra fica estornada (`reversed_at`, sai de todos os
  totais) e o credito nao vira lancamento. Sem compra correspondente, o credito entra como receita
  "Estornos".
- **Rationale**: edge case da spec ("movimentacao estornada sai dos totais").

## R88. Fatura do cartao

- **Decision**: o usuario informa, no cartao importado, o dia de fechamento e o de vencimento. A
  fatura atual sao as compras importadas (nao estornadas) entre o ultimo fechamento e o proximo;
  "ja fechou?" compara hoje com o dia de fechamento. Ferramenta `fatura_do_cartao` responde valor,
  fechamento, vencimento, se fechou e as compras do mes no credito. Sem os dias informados, responde
  as compras do mes e explica como configurar.
- **Rationale**: cenario 3 sem parceiro: o OFX da fatura traz as compras, mas nao traz datas de
  fechamento de forma padronizada.

## R89. So leitura

- **Decision**: extrato e so leitura por natureza; nenhuma ferramenta movimenta dinheiro, e o
  prompt manda responder que o assessor nao faz Pix, transferencia, pagamento ou investimento.
- **Rationale**: FR-035, cenario 5 e principio II.

## R90. Custo e privacidade

- Leitura, categorizacao e uniao sem IA. O numero completo da conta nao e guardado; o arquivo OFX
  nao fica no servidor depois da importacao. Cada importacao fica registrada (quem, quando, periodo
  e quantos lancamentos criados, unidos, ignorados e estornados).

# US9: Cobranca por Pix (nota fiscal adiada)

## R91. Caminho escolhido

- **Decision**: cobranca por Pix estatico com a chave Pix do proprio usuario, sem parceiro, como
  permite a constituicao 1.2.0 (principio II). A nota fiscal de servico fica adiada. Decisao do
  dono do produto em 2026-10-27.
- **O que muda na historia**: FR-036 deixa de ser "por parceiro" e passa a ser Pix na chave do
  usuario, com o dinheiro indo do banco do pagador direto ao banco do usuario; FR-037 vale com a
  confirmacao feita pelo usuario ou pelo extrato (R97); FR-038 e FR-039 e o cenario 3 ficam
  adiados; no cenario 4, o assessor explica que a emissao ainda nao existe; o cenario 5 vale como
  esta.
- **Rationale**: custo zero e nenhuma custodia. Parceiros de cobranca cobram por transacao e os de
  nota fiscal comecam perto de R$ 190 por mes (NFE.io, preco da propria empresa); sem base de
  usuarios, nao compensa.
- **Alternatives considered**: Asaas com a conta do proprio usuario (cobranca e nota no mesmo
  parceiro, confirmacao automatica; fica como caminho para quando a nota entrar); NFE.io e Focus
  NFe so para a nota.

## R92. Chave Pix do usuario

- **Decision**: o titular (ou quem tem `receitas`) cadastra no painel, em Financas > Cobrancas, a
  chave Pix (CPF, CNPJ, e-mail, telefone ou aleatoria), o nome do recebedor e a cidade, como o
  banco exige no codigo. Validacao por tipo: CPF e CNPJ com digito verificador, e-mail, telefone
  com +55 e chave aleatoria no formato UUID. Nome ate 25 e cidade ate 15 caracteres, sem acento
  (limite do padrao).
- **Rationale**: o codigo Pix precisa desses tres campos; o banco do pagador mostra o nome, e o
  usuario confere antes de pagar.

## R93. Codigo Pix (BR Code)

- **Decision**: `src/pix.ts` monta o payload EMV do Banco Central: `00` "01", `26` com GUI
  `br.gov.bcb.pix`, a chave e a descricao, `52` "0000", `53` "986", `54` valor, `58` "BR", `59`
  nome, `60` cidade, `62` com o `txid` da cobranca e `63` com CRC16-CCITT (polinomio 0x1021,
  inicial 0xFFFF). Sem dependencia. O QR e desenhado no navegador com a biblioteca `qrcode`
  (dependencia nova so no painel: desenhar QR do zero nao compensa).
- **Rationale**: padrao publico do Banco Central; qualquer app de banco le.

## R94. Cobranca

- **Decision**: tabela `charges` por conta: pagador (nome e, opcional, WhatsApp), descricao,
  valor, vencimento, `txid` unico de 25 caracteres alfanumericos, `slug` publico aleatorio de 10
  caracteres e situacao `aberta`, `paga` ou `cancelada` (vencida e calculada). O pedido "cobra R$
  850 do Joao pela consultoria de agosto" vira a ferramenta `criar_cobranca`, que devolve o link e
  o copia-e-cola.
- **Rationale**: cenario 1.

## R95. Pagina de pagamento

- **Decision**: `<PAINEL_URL>/pagar/<slug>`, rota publica do painel: nome do recebedor,
  descricao, valor, vencimento, QR, copia-e-cola com botao de copiar e o aviso "O pagamento vai
  direto para {nome} pelo Pix. Este site nao recebe dinheiro". Nada da conta alem disso. Cobranca
  paga ou cancelada mostra so a situacao.
- **Rationale**: principio I e honestidade com quem paga.

## R96. Mandar ao pagador

- **Decision**: com o WhatsApp do pagador e o pedido do usuario, o assessor usa a
  `mensagem_para_contato` da US6 (previa, confirmacao, PARAR e limites) com o link. Sem isso, o
  usuario encaminha o link.
- **Rationale**: reaproveita as regras de mensagem a terceiros em vez de criar outro envio.

## R97. Confirmacao do pagamento

- **Decision**: nunca presumida (principio II). Dois caminhos:
  - o usuario diz "o Joao pagou" (`marcar_cobranca_paga`) ou clica em "Recebi" no painel: lanca a
    receita (categoria "Servicos" ou a que a conta usa para o pagador, contraparte = pagador,
    forma `pix`) e liga a cobranca a ela;
  - na importacao do extrato (US8), um credito na conta corrente com o mesmo valor de uma cobranca
    aberta, com o `txid` na descricao ou o nome do pagador parecido com o do credito, marca a
    cobranca como paga e liga a receita importada, sem criar outra. O usuario recebe
    `💰 {pagador} pagou {valor} (cobranca #{id}).`
- **Rationale**: cenario 2 e FR-037 sem parceiro.

## R98. Cancelar e vencer

- **Decision**: cancelar com confirmacao: a pagina passa a dizer "cobranca cancelada", mas o codigo
  Pix ja copiado continua pagavel (o Pix estatico nao expira). Isso aparece no aviso do painel e da
  ferramenta. Vencida e so uma etiqueta; o codigo continua valido.
- **Rationale**: principio VII: Pix estatico nao da para invalidar.

## R99. Antecipacao e transferencia

- **Decision**: o prompt manda explicar que o assessor nao antecipa, nao transfere e nao mexe no
  dinheiro recebido: isso e feito no app do banco.
- **Rationale**: cenario 5 e principio II.

## R100. Nota fiscal e custo

- **Decision**: pedido de nota recebe "A emissao de nota fiscal ainda nao esta disponivel. Por
  enquanto, emita no site da prefeitura ou com o seu contador." A tela de Cobrancas diz o mesmo.
  Nenhuma chamada ao modelo alem das ferramentas; nenhum custo por cobranca.
- **Rationale**: principio VII e FR-039.