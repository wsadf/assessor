# Feature Specification: Paridade com o Meu Assessor

**Feature Branch**: `001-paridade-meu-assessor`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Evoluir o Assessor MVP para paridade funcional com o Meu Assessor
(meuassessor.com), mantendo nome, assessores e identidade proprios (Bento, Clara, Lia, Davi, Otto,
Nina) e respeitando a constituicao v1.0.0. Faltam, em ordem de prioridade: conta compartilhada,
documentos, avisos proativos de financas, Google Agenda, pagina publica de agendamento, contato com
terceiros, area do contador, Open Finance so leitura, link de cobranca e NFS-e. Fora de escopo:
antecipacao de recebiveis, Pix ou movimentacao iniciada pelo sistema, apps nativos, Gmail."

## Contexto

O Assessor MVP ja registra gastos e receitas por texto, audio e foto, guarda contraparte e
parcelas, cria lembretes e tarefas, manda o resumo da manha e mostra tudo num painel web com seis
mesas. O Meu Assessor, referencia de mercado, vai alem em quatro frentes: conta usada por varias
pessoas, guarda de documentos, assessores que avisam sem esperar o pedido e integracoes (agenda,
banco, cobranca, nota fiscal). Esta spec cobre essas lacunas como historias independentes, em ordem
de prioridade. Cada uma pode ser planejada, entregue e demonstrada sozinha.

O produto mantem identidade propria: nomes, textos, marca e assessores do Assessor MVP. Nenhum
texto, imagem ou nome do Meu Assessor e copiado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conta compartilhada com convites e permissoes (Priority: P1)

O titular convida o socio, a familia ou a equipe para a mesma conta. Ele gera um codigo de convite
no painel ou pede pelo WhatsApp ("adiciona a minha esposa na conta"). A pessoa convidada informa o
codigo no cadastro, conversa com o assessor pelo proprio WhatsApp e os lancamentos dela entram na
conta compartilhada. O titular escolhe o que cada pessoa ve e faz, por exemplo "meu socio ve so os
gastos", e consulta a qualquer momento quem tem acesso.

**Why this priority**: e a base de varias outras historias (contador, documentos da equipe,
avisos para mais de uma pessoa) e responde a um pedido frequente de casais e pequenos negocios. O
isolamento entre contas e o principio I da constituicao, entao o modelo de acesso precisa existir
antes do resto.

**Independent Test**: com duas contas de WhatsApp, o titular gera um convite, a segunda pessoa
entra com o codigo, registra um gasto e o titular ve esse gasto no painel com o nome de quem lancou.
Com a permissao "so gastos", a segunda pessoa nao consegue consultar receitas.

**Acceptance Scenarios**:

1. **Given** um titular com conta ativa, **When** ele gera um convite, **Then** recebe um codigo
   unico, valido por 7 dias, que aparece na lista de convites pendentes e pode ser cancelado.
2. **Given** um codigo valido, **When** outra pessoa se cadastra com ele, **Then** ela entra na
   conta do titular com o perfil escolhido no convite e o assessor a cumprimenta pelo nome.
3. **Given** um membro com perfil "so gastos", **When** ele pergunta "quanto recebi esse mes?",
   **Then** o assessor responde que essa informacao nao esta liberada para ele, sem revelar valores.
4. **Given** um membro que registra "gastei 40 de Uber", **When** o titular abre Transacoes,
   **Then** o lancamento mostra quem registrou.
5. **Given** o titular perguntando "quem tem acesso a conta?", **When** o assessor responde,
   **Then** lista cada pessoa com nome, perfil e data de entrada.
6. **Given** o titular remove um membro, **When** esse membro manda mensagem, **Then** o assessor
   deixa de atende-lo como parte da conta e os lancamentos ja feitos continuam na conta.

---

### User Story 2 - Guarda e busca de documentos (Priority: P2)

O usuario manda um PDF, foto ou arquivo pelo WhatsApp e diz "guarda esse". O assessor guarda,
coloca numa pasta pelo tipo (boletos, notas fiscais, contratos, comprovantes, casa, carro, saude,
outros) e confirma. Depois o usuario pede "acha o contrato do apartamento que assinei em marco" e
recebe o arquivo na conversa. No painel, uma tela de Documentos mostra as pastas, permite baixar,
renomear, mover e excluir.

**Why this priority**: documento perdido e uma dor diaria e o produto ja recebe midia pelo
WhatsApp. Comprovantes e notas guardados tambem alimentam a area do contador (US7).

**Independent Test**: enviar tres arquivos de tipos diferentes, confirmar que cada um caiu na pasta
certa e recuperar um deles descrevendo o conteudo sem citar o nome do arquivo.

**Acceptance Scenarios**:

1. **Given** um PDF de contrato enviado com "guarda esse", **When** o assessor processa,
   **Then** o arquivo vai para Contratos com um titulo descritivo e o assessor confirma em uma frase.
2. **Given** uma foto de cupom fiscal sem texto, **When** o assessor processa, **Then** registra o
   gasto como hoje e tambem guarda a imagem em Notas fiscais, ligada ao lancamento.
3. **Given** documentos guardados, **When** o usuario pede "me manda o comprovante do aluguel",
   **Then** o assessor envia o arquivo mais provavel e, se houver mais de um, lista ate 5 opcoes.
4. **Given** nenhum documento compativel, **When** o usuario pede um arquivo, **Then** o assessor
   diz que nao encontrou e nao inventa um resultado.
5. **Given** a tela Documentos, **When** o usuario move um arquivo de pasta, **Then** a busca pelo
   WhatsApp passa a considerar a nova pasta.

---

### User Story 3 - Avisos proativos de financas (Priority: P3)

O assessor de financas (Bento) passa a avisar sem esperar pergunta: vencimento de fatura e de
contas cadastradas, categoria gastando acima do mes anterior com a projecao de fechamento,
despesas recorrentes lancadas sozinhas ("toda segunda tem 89,90 da academia"), comparativo com o
mes anterior quando pedido e um resumo do fim do dia com o que a equipe registrou.

**Why this priority**: transforma o produto de registro em acompanhamento, que e o que o usuario
percebe como "ter um assessor". Usa dados que ja existem.

**Independent Test**: cadastrar uma conta com vencimento amanha e uma despesa recorrente semanal,
avancar o relogio de teste e verificar que o aviso e o lancamento automatico acontecem uma vez so.

**Acceptance Scenarios**:

1. **Given** uma conta cadastrada com vencimento no dia 10, **When** chega o dia 9 no horario de
   avisos, **Then** o usuario recebe um aviso com nome da conta, valor e data.
2. **Given** a categoria Alimentacao 15% acima do mesmo ponto do mes anterior, **When** roda a
   verificacao diaria, **Then** o assessor avisa a diferenca e a projecao de fechamento do mes, no
   maximo uma vez por categoria por semana.
3. **Given** "toda segunda tem 89,90 da academia", **When** chega cada segunda, **Then** o gasto e
   lancado na categoria certa com a marca de recorrente e pode ser editado ou cancelado.
4. **Given** "compara meu gasto com o mes passado", **When** o assessor responde, **Then** mostra
   total e as tres categorias com maior variacao, em valor e percentual.
5. **Given** o resumo do fim do dia ativado, **When** chega o horario escolhido, **Then** o usuario
   recebe a contagem do que foi registrado no dia (gastos, compromissos, tarefas, documentos).
6. **Given** o usuario diz "para de me avisar de categoria", **When** o assessor confirma, **Then**
   esse tipo de aviso fica desligado ate ele pedir de novo.

---

### User Story 4 - Google Agenda pelo WhatsApp (Priority: P4)

O usuario conecta a propria conta Google uma vez. Depois a assessora de agenda (Lia) cria,
consulta e remarca compromissos a partir de texto ou audio ("marca o dentista quinta as tres da
tarde"), convida pessoas por e-mail, gera o link de videochamada quando pedido e manda de manha os
compromissos do dia.

**Why this priority**: agenda e o segundo uso mais citado depois de financas. Os lembretes atuais
ficam so dentro do produto e nao aparecem no calendario que o usuario ja usa.

**Independent Test**: conectar uma conta Google de teste, pedir "reuniao com a Ana terca 10h com
link" e conferir o evento no Google Agenda com convidado e link de videochamada.

**Acceptance Scenarios**:

1. **Given** uma conta Google conectada, **When** o usuario pede um compromisso com dia e hora,
   **Then** o evento aparece no calendario principal com duracao padrao de 1 hora e o assessor
   confirma com dia, hora e quando vai lembrar.
2. **Given** um pedido sem horario ("marca o dentista quinta"), **When** o assessor processa,
   **Then** pergunta o horario antes de criar.
3. **Given** um conflito com outro evento, **When** o usuario pede o horario, **Then** o assessor
   avisa do conflito e pergunta se cria assim mesmo.
4. **Given** "a reuniao de sexta pode virar 15h?", **When** ha um so evento compativel, **Then** o
   evento e movido e os convidados sao notificados pelo proprio calendario.
5. **Given** a conta Google nao conectada, **When** o usuario pede um compromisso, **Then** o
   assessor cria o lembrete interno, como hoje, e oferece o link para conectar.
6. **Given** o usuario desconecta a conta Google, **When** isso acontece, **Then** o produto para
   de ler e escrever no calendario e apaga o acesso guardado.

---

### User Story 5 - Pagina publica de agendamento (Priority: P5)

O usuario que atende clientes (consultor, personal, terapeuta) compartilha um link. O cliente
escolhe a duracao, o dia e um horario livre, informa nome, e-mail e WhatsApp e confirma. O
compromisso entra na agenda do usuario, o cliente recebe confirmacao no WhatsApp na vespera e,
se o usuario precisar remarcar, a assessora oferece um novo horario ao cliente.

**Why this priority**: amplia o publico para pequenos negocios, mas depende da US4 e e mais
especifica que as anteriores.

**Independent Test**: abrir o link publico sem login, marcar um horario, ver o evento na agenda do
usuario e a mensagem de confirmacao chegar no WhatsApp do cliente de teste.

**Acceptance Scenarios**:

1. **Given** um link de agendamento ativo, **When** o cliente abre, **Then** ve so horarios livres
   dentro da janela de atendimento definida pelo usuario, sem detalhes dos outros compromissos.
2. **Given** um horario escolhido e dados preenchidos, **When** o cliente confirma, **Then** o
   evento e criado e o horario some para os proximos visitantes.
3. **Given** um agendamento para amanha, **When** chega o horario de confirmacao, **Then** o
   cliente recebe a mensagem e a resposta dele e registrada no compromisso.
4. **Given** o usuario diz "nao vou poder atender a Camila amanha", **When** o assessor processa,
   **Then** oferece a Camila ate tres horarios livres e confirma com o usuario o que ela escolheu.
5. **Given** dois clientes tentando o mesmo horario ao mesmo tempo, **When** ambos confirmam,
   **Then** so o primeiro e aceito e o segundo ve a mensagem de horario ocupado.

---

### User Story 6 - Assessor fala com outras pessoas pelo usuario (Priority: P6)

O usuario pede "lembra o Joao de pagar o personal todo dia 5" ou "avisa meu irmao do aniversario da
mae dia 27". O assessor manda a mensagem para o contato informado, identificando em nome de quem
fala, e conta ao usuario o que aconteceu (entregue, respondido, sem resposta).

**Why this priority**: diferencial forte, mas com risco de spam e de reputacao do numero. Fica
depois das historias que so envolvem o proprio usuario.

**Independent Test**: pedir um aviso para um segundo numero de teste e verificar a mensagem
recebida, a identificacao do remetente, a opcao de parar e o relato devolvido ao usuario.

**Acceptance Scenarios**:

1. **Given** um pedido com contato e texto, **When** o assessor prepara o envio, **Then** mostra ao
   usuario a mensagem e o destinatario e so envia depois da confirmacao.
2. **Given** a mensagem enviada ao terceiro, **When** ela chega, **Then** comeca dizendo que e o
   assessor de [nome do usuario] e termina com a opcao de responder PARAR.
3. **Given** um terceiro que respondeu PARAR, **When** o usuario pede novo envio para ele, **Then**
   o assessor informa que a pessoa pediu para nao receber mensagens e nao envia.
4. **Given** um envio recorrente, **When** o usuario diz "para de cobrar o Joao", **Then** os envios
   futuros sao cancelados.
5. **Given** o terceiro respondeu, **When** a resposta chega, **Then** o usuario recebe um resumo
   dela.

---

### User Story 7 - Area do contador (Priority: P7)

O titular convida o contador com um codigo proprio. O contador entra no painel e ve, so para
leitura, o dossie fiscal de cada mes: lancamentos, receitas e documentos guardados (notas,
comprovantes, boletos). Ele pode baixar o mes inteiro de uma vez.

**Why this priority**: valor alto para quem tem negocio, mas reaproveita a US1 (convites) e a US2
(documentos), entao vem depois delas.

**Independent Test**: convidar uma conta de contador, entrar com ela e confirmar que ve o mes,
baixa os arquivos e nao consegue editar nada nem conversar como membro da conta.

**Acceptance Scenarios**:

1. **Given** um convite de contador aceito, **When** o contador entra no painel, **Then** ve so a
   area do contador do titular, com os meses disponiveis.
2. **Given** um mes selecionado, **When** o contador pede para baixar, **Then** recebe um pacote
   com a planilha de lancamentos e os documentos do mes.
3. **Given** o contador tentando editar ou excluir, **When** ele age, **Then** a acao nao existe na
   tela e qualquer tentativa direta e recusada.
4. **Given** o titular revoga o acesso, **When** o contador recarrega, **Then** perde o acesso na
   hora.

---

### User Story 8 - Banco conectado pelo Open Finance, so leitura (Priority: P8)

O usuario autoriza a leitura de contas e cartoes pelo Open Finance. As movimentacoes e faturas
entram sozinhas, categorizadas e com contraparte, sem duplicar o que ele ja registrou pelo
WhatsApp. O assessor passa a responder "minha fatura ja fechou?" e "no credito, quanto ja foi esse
mes?" com dados do banco.

**Why this priority**: aumenta muito a utilidade, mas depende de parceiro regulado, contrato e
custo por conexao. Vem depois das historias que o produto entrega sozinho.

**Independent Test**: conectar uma conta no ambiente de testes do parceiro, importar as
movimentacoes e conferir categorias, contraparte e ausencia de duplicatas com lancamentos manuais.

**Acceptance Scenarios**:

1. **Given** o usuario autoriza um banco, **When** a importacao termina, **Then** as movimentacoes
   dos ultimos 90 dias aparecem marcadas como importadas, com categoria e contraparte.
2. **Given** um gasto ja registrado por mensagem com mesmo valor e data proxima, **When** a
   movimentacao do banco chega, **Then** os dois sao unidos em um lancamento so.
3. **Given** um cartao conectado, **When** o usuario pergunta pela fatura, **Then** recebe valor,
   data de fechamento e vencimento.
4. **Given** o consentimento expirado ou revogado, **When** isso e detectado, **Then** a importacao
   para e o usuario e avisado com o caminho para renovar.
5. **Given** qualquer pedido de pagamento ou transferencia, **When** o usuario pede, **Then** o
   assessor explica que o acesso ao banco e so de leitura.

---

### User Story 9 - Link de cobranca e nota fiscal de servico (Priority: P9)

O usuario com negocio pede "cobra R$ 850 do Joao pela consultoria de agosto". O assessor gera um
link de pagamento por um parceiro, envia ao usuario (ou ao Joao, se a US6 estiver ativa), avisa
quando o pagamento cair e, a pedido, emite a nota fiscal de servico e devolve o PDF na conversa.

**Why this priority**: atende pequenos negocios, mas exige CNPJ ou cadastro municipal, contrato com
parceiro de pagamento e de emissao de nota, e so e permitida porque o dinheiro nunca passa pelo
produto (principio II, constituicao v1.1.0).

**Independent Test**: no ambiente de testes dos parceiros, gerar um link, simular o pagamento,
receber o aviso e emitir a nota de homologacao com o PDF na conversa.

**Acceptance Scenarios**:

1. **Given** um usuario com conta no parceiro de pagamento, **When** pede uma cobranca com valor e
   pagador, **Then** recebe o link com valor, descricao e vencimento.
2. **Given** o pagador paga, **When** o parceiro confirma, **Then** o usuario recebe o aviso e a
   receita e registrada na mesa Financas.
3. **Given** uma cobranca paga, **When** o usuario pede a nota, **Then** a nota e emitida com os
   dados do tomador e o PDF chega na conversa e na pasta Notas fiscais.
4. **Given** um usuario sem os dados fiscais cadastrados, **When** pede uma nota, **Then** o
   assessor explica o que falta e nao tenta emitir.
5. **Given** o pedido de antecipacao ou de transferencia do saldo, **When** o usuario pede,
   **Then** o assessor explica que isso e feito direto no parceiro.

---

### Edge Cases

- Uma pessoa recebe convite para uma segunda conta: ela escolhe com qual conta o numero conversa;
  o mesmo WhatsApp nao alimenta duas contas ao mesmo tempo.
- O titular tenta sair da propria conta com membros ativos: precisa transferir a titularidade ou
  remover os membros antes.
- Arquivo acima do limite do WhatsApp ou formato nao suportado: o assessor avisa e nao guarda.
- Busca de documento com termos que batem em pastas de membros sem permissao: os resultados
  respeitam o perfil de quem pergunta.
- Aviso proativo fora da janela de 24 horas do WhatsApp sem modelo aprovado: o aviso fica pendente
  e e entregue na proxima conversa, como os lembretes atuais.
- Despesa recorrente num dia que nao existe no mes (dia 31): lanca no ultimo dia do mes.
- Token do Google expirado no meio de um pedido: o assessor avisa e cria um lembrete interno para
  nao perder o compromisso.
- Fuso horario do cliente diferente do usuario na pagina publica: horarios exibidos no fuso do
  cliente, gravados no fuso do usuario.
- Terceiro bloqueia o numero do assessor ou o envio falha: o usuario recebe o relato da falha.
- Movimentacao do banco estornada depois de importada: o lancamento e marcado como estornado e
  sai dos totais.
- Prefeitura do usuario sem suporte do parceiro de nota: o assessor informa que a emissao nao esta
  disponivel para aquela cidade (principio VII).

## Requirements *(mandatory)*

### Functional Requirements

**Conta compartilhada (US1)**

- **FR-001**: O sistema MUST permitir que o titular gere convites com codigo unico, validade de 7
  dias e perfil de acesso escolhido, e que cancele convites pendentes.
- **FR-002**: O sistema MUST oferecer ao menos os perfis: titular, membro completo, membro so
  gastos (registra e ve so despesas), membro so agenda e tarefas, e contador (so leitura do dossie).
- **FR-003**: Toda consulta, ferramenta do assessor e tela do painel MUST aplicar o perfil de quem
  pergunta antes de devolver dados.
- **FR-004**: Cada lancamento, lembrete, tarefa e documento MUST registrar quem o criou.
- **FR-005**: O titular MUST conseguir listar, alterar o perfil e remover membros pelo painel e
  pelo WhatsApp.
- **FR-006**: Um numero de WhatsApp MUST estar ligado a no maximo uma conta por vez.

**Documentos (US2)**

- **FR-007**: O sistema MUST guardar arquivos e imagens enviados quando o usuario pedir ou quando
  forem comprovantes ligados a um lancamento.
- **FR-008**: O sistema MUST classificar cada documento em uma pasta padrao e dar um titulo
  descritivo, permitindo correcao pelo usuario.
- **FR-009**: O usuario MUST conseguir buscar documentos por descricao em linguagem natural e
  receber o arquivo na conversa.
- **FR-010**: O painel MUST ter uma tela de Documentos com pastas, busca, download, renomear, mover
  e excluir.
- **FR-011**: O sistema MUST limitar o armazenamento por conta e avisar ao chegar a 80% do limite.

**Avisos proativos (US3)**

- **FR-012**: O usuario MUST conseguir cadastrar contas a pagar com vencimento, por mensagem ou no
  painel, e receber aviso na vespera.
- **FR-013**: O sistema MUST detectar categorias com gasto pelo menos 15% acima do mesmo ponto do
  mes anterior e avisar com a projecao de fechamento, no maximo uma vez por categoria por semana.
- **FR-014**: O usuario MUST conseguir criar despesas e receitas recorrentes (diaria, semanal,
  mensal) que sao lancadas sozinhas e podem ser pausadas ou canceladas.
- **FR-015**: O sistema MUST enviar o resumo do fim do dia no horario escolhido, quando ativado.
- **FR-016**: O usuario MUST conseguir ligar e desligar cada tipo de aviso pelo WhatsApp e pelo
  painel.

**Google Agenda (US4)**

- **FR-017**: O usuario MUST conseguir conectar e desconectar a propria conta Google, com
  permissao limitada ao calendario.
- **FR-018**: O assessor MUST criar, consultar, remarcar e cancelar eventos a partir de texto ou
  audio, perguntando o que faltar (data ou hora) antes de criar.
- **FR-019**: O assessor MUST convidar participantes por e-mail e gerar link de videochamada
  quando pedido.
- **FR-020**: O resumo da manha MUST incluir os eventos do dia do Google Agenda quando conectado.

**Pagina de agendamento (US5)**

- **FR-021**: O usuario MUST conseguir ativar um link publico com duracoes oferecidas, dias e
  janela de atendimento e antecedencia minima.
- **FR-022**: A pagina publica MUST mostrar so horarios livres e nunca o conteudo dos outros
  compromissos.
- **FR-023**: O sistema MUST impedir dois agendamentos no mesmo horario.
- **FR-024**: O sistema MUST mandar confirmacao ao cliente na vespera e permitir remarcar com ate
  tres opcoes de horario livre.

**Contato com terceiros (US6)**

- **FR-025**: O assessor MUST mostrar destinatario e texto e pedir confirmacao antes do primeiro
  envio a um terceiro e antes de criar um envio recorrente.
- **FR-026**: Toda mensagem a terceiro MUST identificar o usuario em nome de quem fala e oferecer a
  opcao de parar.
- **FR-027**: O sistema MUST manter uma lista de terceiros que pediram para parar e bloquear novos
  envios a eles, de qualquer conta.
- **FR-028**: O sistema MUST limitar os envios a terceiros por conta por dia, para proteger a
  reputacao do numero.

**Area do contador (US7)**

- **FR-029**: O contador MUST ter acesso so leitura aos lancamentos e documentos do titular,
  organizados por mes, sem acesso a conversa, agenda ou tarefas.
- **FR-030**: O contador MUST conseguir baixar o mes em um pacote com planilha e documentos.
- **FR-031**: O titular MUST conseguir revogar o acesso do contador com efeito imediato.

**Open Finance (US8)**

- **FR-032**: O sistema MUST conectar contas e cartoes so com permissao de leitura, por meio de
  parceiro autorizado pelo Banco Central.
- **FR-033**: Movimentacoes importadas MUST receber categoria e contraparte e ser unidas a
  lancamentos manuais equivalentes, sem duplicar.
- **FR-034**: O sistema MUST avisar o usuario quando o consentimento estiver perto de vencer ou for
  revogado.
- **FR-035**: O sistema MUST NOT oferecer nenhuma acao que movimente dinheiro a partir do banco
  conectado.

**Cobranca e nota fiscal (US9)**

- **FR-036**: O sistema MUST gerar links de pagamento por parceiro, com o valor pago indo direto do
  pagador para a conta do usuario no parceiro, sem passar pelo produto. O produto so le a
  confirmacao do pagamento e nunca recebe, retem, repassa ou antecipa o valor (principio II,
  constituicao v1.1.0).
- **FR-037**: O sistema MUST registrar como receita o pagamento confirmado pelo parceiro.
- **FR-038**: O sistema MUST emitir nota fiscal de servico por parceiro, com os dados fiscais
  cadastrados pelo usuario, e guardar o PDF em Notas fiscais.
- **FR-039**: O sistema MUST informar quando a cidade ou o cadastro do usuario nao permite emissao.

**Transversais**

- **FR-040**: Toda capacidade nova pelo WhatsApp MUST funcionar com os dois provedores de IA
  suportados (principio III).
- **FR-041**: Toda integracao externa nao configurada MUST aparecer como nao ligada na tela e na
  resposta do assessor (principio VII).
- **FR-042**: O usuario MUST conseguir apagar a conta com todos os dados, documentos e acessos a
  integracoes.

### Key Entities *(include if feature involves data)*

- **Conta**: agrupa dados financeiros, agenda, tarefas e documentos; tem um titular e um plano.
- **Membro**: pessoa ligada a uma conta por um numero de WhatsApp e um login, com um perfil.
- **Perfil de acesso**: conjunto de permissoes (ver e criar por area) atribuido a um membro.
- **Convite**: codigo com perfil, validade, situacao (pendente, aceito, cancelado, expirado).
- **Documento**: arquivo guardado, com titulo, pasta, autor, data, tamanho e lancamento ligado.
- **Pasta**: agrupamento de documentos, padrao ou criado pelo usuario.
- **Conta a pagar**: compromisso financeiro com valor, vencimento e recorrencia opcional.
- **Recorrencia**: regra que gera lancamentos futuros (frequencia, valor, categoria, situacao).
- **Preferencia de aviso**: tipo de aviso, ligado ou desligado, horario.
- **Integracao**: conexao autorizada com servico externo (Google, banco, pagamento, nota), com
  situacao e validade do consentimento.
- **Link de agendamento**: duracoes, janela de atendimento, antecedencia e situacao.
- **Agendamento**: horario reservado por um cliente externo, com dados de contato e confirmacao.
- **Contato externo**: terceiro com quem o assessor fala, com historico de envios e opt-out.
- **Envio a terceiro**: mensagem unica ou recorrente, com situacao e resposta recebida.
- **Cobranca**: valor, pagador, descricao, vencimento, situacao e nota ligada.
- **Nota fiscal**: numero, tomador, valor, servico, situacao e documento PDF.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um convidado consegue entrar numa conta compartilhada e registrar o primeiro gasto em
  menos de 3 minutos a partir do recebimento do codigo.
- **SC-002**: Em testes com 50 pedidos de acesso indevido entre perfis e entre contas, nenhum
  devolve dados nao permitidos.
- **SC-003**: Em 90% das buscas de documento por descricao, o arquivo certo esta entre as tres
  primeiras opcoes.
- **SC-004**: 95% dos avisos de vencimento chegam na vespera, no horario configurado, e nenhum
  aviso e enviado em duplicidade.
- **SC-005**: Um compromisso pedido por audio aparece no Google Agenda em menos de 15 segundos
  depois da mensagem.
- **SC-006**: Um cliente externo conclui um agendamento pela pagina publica em menos de 1 minuto,
  sem criar conta.
- **SC-007**: Zero mensagens enviadas a terceiros que pediram para parar.
- **SC-008**: O contador baixa o dossie de um mes com ate 300 lancamentos em menos de 30 segundos.
- **SC-009**: Menos de 2% das movimentacoes importadas do banco geram lancamento duplicado.
- **SC-010**: O custo de IA por conta ativa continua dentro da meta da constituicao (perto de
  R$ 3 por mes) com as historias P1 a P4 ligadas.

## Assumptions

- Publico: pessoa fisica e pequeno negocio no Brasil, falando portugues, com WhatsApp.
- A conta atual de cada usuario vira uma conta com um titular, sem migracao manual.
- A janela de 24 horas do WhatsApp continua valendo; avisos e mensagens a terceiros fora dela usam
  modelos aprovados pela Meta da categoria utilidade.
- Limite inicial de armazenamento: 1 GB por conta; arquivos ate o limite do proprio WhatsApp.
- Documentos e dados ficam guardados enquanto a conta existir e sao apagados ate 30 dias depois do
  cancelamento.
- Perfis sao fixos nesta versao; permissoes personalizadas por area ficam para depois.
- Google Agenda e o unico calendario suportado; Outlook e outros ficam fora.
- Open Finance, cobranca e nota fiscal dependem de contrato com parceiros; o custo por conexao e
  avaliado no plano frente ao principio IV.
- A conta-mae B2B que consolida varias contas (fase 5 do plano original) fica fora desta spec.
- Fora de escopo: antecipacao de recebiveis, Pix ou qualquer movimentacao iniciada pelo sistema,
  apps nativos, leitura ou envio de e-mail (Gmail), copia de marca, textos ou nomes do Meu Assessor.
