# Research: Paridade com o Meu Assessor

Decisoes por historia. R1 a R10 sao da US1 (conta compartilhada, implementada); R11 a R22 sao da
US2 (documentos). As demais historias acrescentam secoes aqui.

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
