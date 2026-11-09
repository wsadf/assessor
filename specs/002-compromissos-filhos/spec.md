# Feature Specification: Compromissos dos filhos

**Feature Branch**: `002-compromissos-filhos`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Compromissos dos filhos: o usuario cadastra os filhos (nome e data de
nascimento) e registra compromissos deles, como trabalhos e provas da escola, aniversarios de
amiguinhos (com o nome do amigo e ideia de presente), vacinas (com as proximas doses), consultas
medicas e outros. O assessor avisa antes de cada compromisso, repete o que e anual (aniversarios),
lista o que vem por ai por filho e na semana, e o painel mostra tudo numa tela. Funciona pelo
WhatsApp e pelo painel, com os dados isolados por conta."

## Contexto

O Assessor MVP ja guarda lembretes, tarefas, contas a pagar e a agenda, e avisa sem esperar o
pedido. Quem tem filhos pequenos carrega, alem disso, uma segunda agenda: entrega de trabalho da
escola, prova, aniversario de amiguinho com presente para comprar, vacina com dose seguinte,
consulta de rotina. Hoje isso vira lembrete solto, sem saber de qual filho e sem agrupar.

Esta spec cria o conceito de **filho** e de **compromisso do filho**, para que o assessor de agenda
(Day) cuide dessa rotina por conversa e o painel mostre tudo por filho e por semana. Cada historia
abaixo pode ser planejada, entregue e demonstrada sozinha.

O produto nao e um prontuario, nem um sistema escolar. Guarda so o que o usuario conta, para
lembrar na hora certa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar filhos e registrar compromissos pela conversa (Priority: P1)

O usuario conta ao assessor quem sao os filhos ("tenho a Marina, 8 anos, e o Pedro, que nasceu em
12/03/2019") e passa a registrar compromissos do jeito que fala: "a Marina tem prova de ciencias
sexta", "aniversario do Joao, amigo do Pedro, dia 20 as 15h, ideia de presente: quebra-cabeca",
"consulta do Pedro no pediatra dia 14 as 9h". O assessor entende de qual filho, de que tipo e
quando, pergunta so o que faltar e confirma em uma frase.

**Why this priority**: sem o cadastro e o registro por conversa nao ha o que avisar nem listar. E o
mesmo caminho que o usuario ja usa para gastos e lembretes, entao o custo de adotar e baixo.

**Independent Test**: com a conta demo, cadastrar dois filhos e registrar um compromisso de cada tipo
(escola, aniversario de amigo, consulta, vacina, outro), por texto, e conferir que cada um ficou
ligado ao filho certo, com data, hora e tipo corretos.

**Acceptance Scenarios**:

1. **Given** uma conta sem filhos, **When** o usuario diz "tenho a Marina, 8 anos", **Then** o
   assessor pergunta a data de nascimento para guardar com precisao, e se o usuario preferir nao
   informar, guarda so a idade aproximada e avisa que o aviso de aniversario do filho nao sera
   criado.
2. **Given** dois filhos cadastrados, **When** o usuario diz "prova de matematica sexta", **Then** o
   assessor pergunta "da Marina ou do Pedro?" antes de registrar.
3. **Given** um filho unico cadastrado, **When** o usuario diz "dentista amanha as 16h", **Then** o
   compromisso entra para esse filho sem pergunta extra e o assessor confirma com dia da semana,
   data e hora.
4. **Given** "aniversario do Joao, amigo do Pedro, sabado as 15h, presente: quebra-cabeca",
   **When** o assessor processa, **Then** registra um aniversario de amigo do Pedro com o nome do
   amigo, a data, a hora e a ideia de presente, marcado como "presente por comprar".
5. **Given** um pedido sem data ("preciso marcar pediatra pro Pedro"), **When** o assessor
   processa, **Then** registra como "a marcar", sem aviso de data, e lembra o usuario na revisao
   semanal enquanto nao houver data.
6. **Given** a mesma consulta para os dois filhos ("vacina dos dois dia 10"), **When** o assessor
   processa, **Then** cria um compromisso para cada filho e confirma os dois.

---

### User Story 2 - Avisos antes dos compromissos e repeticao anual (Priority: P1)

O assessor avisa pelo WhatsApp antes de cada compromisso, sem o usuario pedir: na vespera de
trabalho, prova, vacina e consulta, e alguns dias antes do aniversario de amiguinho, para dar tempo
de comprar o presente. Aniversario repete todo ano sozinho. O aniversario de cada filho entra
automatico a partir da data de nascimento.

**Why this priority**: lembrar na hora certa e o motivo de o recurso existir. Sem aviso, o cadastro
vira mais uma lista para consultar.

**Independent Test**: com datas simuladas, criar compromissos de cada tipo e conferir que o aviso
sai uma vez, no dia e no horario certos, e que o aniversario do amigo volta no ano seguinte.

**Acceptance Scenarios**:

1. **Given** um trabalho da Marina com entrega na sexta, **When** chega a quinta no horario padrao
   de avisos, **Then** o assessor manda uma mensagem curta com o filho, o que e e a data.
2. **Given** um aniversario de amigo no sabado com presente "por comprar", **When** faltam 3 dias,
   **Then** o assessor avisa citando a ideia de presente, e avisa de novo na vespera, citando o
   presente so se ele continuar por comprar.
3. **Given** um aniversario de amigo ja realizado, **When** o proximo ano chega, **Then** o
   compromisso volta sozinho na nova data, com a ideia de presente anterior mostrada como
   lembrete e o presente de novo "por comprar".
4. **Given** o filho Pedro com data de nascimento cadastrada, **When** faltam 7 dias para o
   aniversario dele, **Then** o assessor avisa, e repete todo ano.
5. **Given** o usuario diz "me avisa uma semana antes" para um compromisso, **When** o assessor
   registra, **Then** esse compromisso usa a antecedencia pedida em lugar da padrao.
6. **Given** o usuario fora da janela de 24 horas do WhatsApp sem modelo aprovado, **When** chega a
   hora do aviso, **Then** o aviso fica pendente e e entregue na proxima conversa, como os demais
   avisos do produto.
7. **Given** uma conta compartilhada, **When** chega o aviso de um compromisso, **Then** cada
   membro com acesso a agenda recebe, respeitando a preferencia de aviso de cada um.
8. **Given** o resumo da manha ligado, **When** ele e enviado, **Then** inclui os compromissos dos
   filhos do dia.

---

### User Story 3 - Consultar o que vem por ai e atualizar compromissos (Priority: P2)

O usuario pergunta "o que o Pedro tem essa semana?" ou "o que vem por ai dos meninos?" e recebe a
lista por filho, em ordem de data. Tambem conclui ("entreguei o trabalho da Marina"), remarca ("a
consulta passou para dia 18"), cancela e marca presente como comprado ("ja comprei o presente do
Joao").

**Why this priority**: o aviso resolve o dia a dia, a consulta resolve a organizacao da semana e
evita aviso repetido de coisa ja resolvida.

**Independent Test**: com varios compromissos cadastrados, pedir a lista da semana por filho e dos
proximos 30 dias, concluir um, remarcar outro e confirmar que os avisos acompanham a mudanca.

**Acceptance Scenarios**:

1. **Given** compromissos de dois filhos, **When** o usuario pergunta "o que vem por ai?", **Then**
   o assessor lista agrupado por filho, com data, hora, tipo e, para aniversario, o presente.
2. **Given** "o que a Marina tem essa semana?", **When** a semana nao tem nada, **Then** o assessor
   diz que nao ha compromissos, sem inventar.
3. **Given** um compromisso com aviso agendado, **When** o usuario o conclui, **Then** nenhum aviso
   futuro dele e enviado.
4. **Given** uma consulta remarcada, **When** o assessor confirma a nova data, **Then** o aviso
   passa para a nova data e nao sai mais na antiga.
5. **Given** "ja comprei o presente do Joao", **When** o assessor processa, **Then** o presente fica
   como comprado e o aviso de vespera deixa de citar o presente.
6. **Given** dois compromissos parecidos ("prova de ciencias" de filhos diferentes), **When** o
   usuario pede para concluir "a prova de ciencias", **Then** o assessor pergunta de qual filho antes
   de alterar.

---

### User Story 4 - Tela Filhos no painel (Priority: P2)

No painel, uma tela mostra os filhos como cartoes (nome, idade, proximo compromisso) e uma linha do
tempo dos proximos compromissos de todos, com filtro por filho e por tipo. O usuario cria, edita,
conclui, remarca e apaga compromissos, cadastra e remove filhos, e ve aniversarios de amigos com o
presente por comprar em destaque.

**Why this priority**: conferir a semana de uma vez e corrigir um dado e mais facil numa tela do
que numa conversa. O painel e o mesmo banco do WhatsApp, entao nao ha o que sincronizar.

**Independent Test**: criar um compromisso pelo WhatsApp, conferir que aparece no painel; editar a
data no painel e conferir que o assessor responde com a nova data.

**Acceptance Scenarios**:

1. **Given** dois filhos cadastrados, **When** o usuario abre a tela Filhos, **Then** ve um cartao por
   filho com nome, idade e o proximo compromisso, e a lista da semana de todos os filhos abaixo.
2. **Given** a lista, **When** o usuario filtra por um filho e por "aniversarios", **Then** so
   aparecem aniversarios desse filho, com o presente e o estado dele.
3. **Given** um compromisso criado no painel, **When** o usuario pergunta ao assessor sobre ele,
   **Then** o assessor o conhece e o avisa na data.
4. **Given** um membro com perfil sem acesso a agenda ("so gastos"), **When** ele tenta abrir a tela
   Filhos, **Then** nao ve filhos nem compromissos e recebe a mensagem padrao de sem permissao.
5. **Given** uma conta sem filhos, **When** o usuario abre a tela, **Then** ve uma explicacao curta
   com um exemplo de frase para mandar ao assessor e um botao para cadastrar o primeiro filho.

---

### User Story 5 - Vacinas com proximas doses e consultas de rotina (Priority: P3)

Para vacinas, o usuario registra o que foi aplicado e a proxima dose ("o Pedro tomou a segunda dose
da gripe hoje, a proxima e em 6 meses"), e o assessor cria o compromisso da proxima dose com aviso.
Para consultas de rotina, o usuario diz que se repetem ("pediatra da Marina de 6 em 6 meses") e o
compromisso volta sozinho depois de concluido. O painel mostra o historico de vacinas por filho, em
ordem de data.

**Why this priority**: vacina e consulta de rotina sao o compromisso mais facil de esquecer e o
mais caro de esquecer, mas a historia anterior ja cobre registrar e avisar cada um isoladamente.
Esta acrescenta o encadeamento e o historico.

**Independent Test**: registrar uma vacina aplicada com proxima dose em 6 meses e conferir o
compromisso criado e o historico; criar uma consulta que repete a cada 6 meses, conclui-la e
conferir que a seguinte nasce na data certa.

**Acceptance Scenarios**:

1. **Given** "o Pedro tomou a 2a dose da gripe hoje, proxima em 6 meses", **When** o assessor
   processa, **Then** guarda a vacina como aplicada hoje e cria o compromisso da proxima dose na
   data certa, com aviso.
2. **Given** uma vacina aplicada sem proxima dose, **When** o assessor registra, **Then** pergunta se
   ha proxima dose e, se o usuario disser que nao, encerra sem criar compromisso.
3. **Given** "pediatra da Marina de 6 em 6 meses", **When** a consulta e concluida, **Then** nasce a
   seguinte 6 meses depois da data da consulta concluida, com o mesmo horario sugerido e aviso.
4. **Given** historico de vacinas de um filho, **When** o usuario abre o cartao dele no painel,
   **Then** ve as vacinas aplicadas em ordem de data, com dose e data, e as proximas doses
   marcadas.
5. **Given** o usuario pergunta "que vacinas o Pedro precisa tomar?", **When** o assessor responde,
   **Then** diz que nao indica quais vacinas tomar, mostra o que esta registrado e orienta
   consultar o calendario de vacinacao oficial e o pediatra.

---

### Edge Cases

- Dois filhos com o mesmo nome ou apelido na mesma conta: o assessor pede um apelido que os
  diferencie antes de cadastrar o segundo.
- Data de nascimento no futuro ou idade impossivel: o assessor pede para conferir e nao cadastra.
- Aniversario em 29 de fevereiro: em ano comum, o aviso e a data valem 28 de fevereiro.
- Compromisso com data no passado: o assessor confirma se e um registro do que ja aconteceu e, se
  for, grava como concluido, sem aviso.
- "Amanha", "sexta" e "dia 10" sao lidos no fuso da conta; se a data for ambigua, o assessor
  pergunta antes de gravar.
- Filho removido: o assessor pede confirmacao e informa que os compromissos dele serao apagados
  junto; depois disso nenhum aviso dele e enviado.
- Membro da conta compartilhada removido: os filhos e compromissos continuam na conta, ligados a
  conta e nao a ele.
- Compromisso criado pelo painel e pelo WhatsApp quase ao mesmo tempo: nenhum fica duplicado nem
  se perde, e o aviso sai uma vez.
- Compromisso criado no dia em que o aviso sairia, ou depois: nao ha aviso retroativo, porque o
  usuario acabou de saber. O resumo da manha do proprio dia traz o item.
- Servidor fora do ar na hora do aviso: o aviso sai quando voltar, desde que a data do compromisso
  nao tenha passado, e nunca mais de uma vez.
- Pedido de dado medico alem do registrado ("o Pedro tem alergia a que?"): o assessor responde so o
  que o usuario registrou e, se nao ha, diz que nao tem o dado (principio VII).
- Audio com o pedido e tratado como o texto equivalente. Foto de convite de aniversario ou de
  bilhete da escola: nesta versao o assessor pede que o usuario escreva o compromisso e nao grava a
  partir da imagem.

## Requirements *(mandatory)*

### Functional Requirements

**Filhos e compromissos (US1)**

- **FR-001**: O usuario MUST conseguir cadastrar, editar e remover filhos por conversa e pelo
  painel, informando nome ou apelido e data de nascimento.
- **FR-002**: O sistema MUST permitir ate 10 filhos por conta e MUST impedir dois filhos com o mesmo
  nome na mesma conta.
- **FR-003**: O usuario MUST conseguir registrar compromissos de um filho com tipo (escola,
  aniversario de amigo, vacina, consulta, outro), titulo, data, hora opcional, local opcional e
  observacao.
- **FR-004**: Para aniversario de amigo, o sistema MUST guardar o nome do amigo, uma ideia de
  presente e se o presente esta por comprar ou comprado.
- **FR-005**: Para compromisso de escola, o sistema MUST aceitar a disciplina ou materia como
  informacao opcional.
- **FR-006**: O assessor MUST identificar de qual filho e o compromisso, perguntando quando houver
  mais de um filho e a mensagem nao disser, e MUST perguntar o que faltar (data) antes de gravar.
- **FR-007**: O sistema MUST aceitar compromisso sem data como "a marcar", sem aviso de data.
- **FR-008**: Cada compromisso e cada filho MUST registrar quem o criou, e MUST pertencer a conta,
  nao ao membro.

**Avisos e repeticao (US2)**

- **FR-009**: O sistema MUST avisar pelo WhatsApp antes de cada compromisso com data. O padrao
  MUST ser um aviso na vespera, no horario padrao dos avisos, e para aniversario de amigo um
  aviso 3 dias antes mais outro na vespera.
- **FR-010**: O usuario MUST poder escolher a antecedencia do aviso por compromisso, por exemplo
  "uma semana antes".
- **FR-011**: Aniversario de amigo MUST se repetir todo ano na nova data, com o presente voltando a
  "por comprar" e a ideia anterior mostrada.
- **FR-012**: O aniversario de cada filho MUST ser criado automaticamente a partir da data de
  nascimento, com aviso 7 dias antes e repeticao anual.
- **FR-013**: Compromissos concluidos ou cancelados MUST NOT gerar novos avisos, e um aviso MUST
  ser enviado uma unica vez por compromisso e por antecedencia.
- **FR-014**: Em conta compartilhada, o aviso MUST ir a cada membro com acesso a agenda,
  respeitando a preferencia de aviso de cada um, e o usuario MUST poder ligar e desligar esse tipo
  de aviso pelo WhatsApp e pelo painel.
- **FR-015**: Aviso fora da janela de 24 horas do WhatsApp sem modelo aprovado MUST ficar pendente
  e ser entregue na proxima conversa.
- **FR-016**: O resumo da manha MUST incluir os compromissos dos filhos do dia quando estiver
  ligado.
- **FR-017**: O assessor MUST lembrar semanalmente dos compromissos "a marcar" enquanto nao houver
  data.

**Consulta e atualizacao (US3)**

- **FR-018**: O usuario MUST conseguir pedir a lista do que vem por ai por filho, na semana ou nos
  proximos 30 dias, e a resposta MUST agrupar por filho em ordem de data.
- **FR-019**: O usuario MUST conseguir concluir, remarcar, cancelar e editar compromissos, e marcar
  o presente como comprado, por conversa e pelo painel.
- **FR-020**: Remarcar ou concluir MUST atualizar os avisos futuros do compromisso.
- **FR-021**: Quando o pedido de alterar for ambiguo entre compromissos ou filhos, o assessor MUST
  perguntar antes de alterar.

**Painel (US4)**

- **FR-022**: O painel MUST ter uma tela Filhos com um cartao por filho (nome, idade, proximo
  compromisso) e a lista dos proximos compromissos de todos, com filtro por filho e por tipo.
- **FR-023**: A tela MUST permitir criar, editar, concluir, remarcar e apagar compromissos e
  cadastrar e remover filhos, usando as mesmas regras da conversa (principio V).
- **FR-024**: A tela MUST destacar aniversarios de amigos com presente por comprar.
- **FR-025**: A tela MUST mostrar estado vazio com orientacao e exemplo quando nao houver filhos.

**Vacinas e rotina (US5)**

- **FR-026**: O sistema MUST guardar vacinas aplicadas com nome, dose e data, e, quando informada,
  criar o compromisso da proxima dose com aviso.
- **FR-027**: O sistema MUST permitir consulta de rotina com repeticao a cada N meses (de 1 a 24),
  criando a proxima ocorrencia a partir da data da consulta concluida.
- **FR-028**: O painel MUST mostrar o historico de vacinas aplicadas de cada filho, em ordem de
  data, e as proximas doses marcadas.
- **FR-029**: O assessor MUST NOT indicar quais vacinas ou consultas o filho deve fazer, nem doses,
  idades ou prazos recomendados. MUST informar so o que o usuario registrou e orientar a consultar
  o calendario oficial e o pediatra.

**Transversais**

- **FR-030**: Toda consulta, ferramenta do assessor e tela do painel MUST filtrar por conta e
  aplicar o perfil de acesso: so quem tem acesso a agenda ve e altera filhos e compromissos (principio
  I).
- **FR-031**: Toda capacidade nova pelo WhatsApp MUST funcionar com os dois provedores de IA
  suportados (principio III).
- **FR-032**: Os dados dos filhos MUST ser apagados junto com o proprio filho e MUST ficar prontos
  para serem apagados junto com a conta quando o produto passar a ter exclusao de conta (hoje nao
  tem, e isso MUST constar no README). Os dados MUST NOT ser compartilhados com terceiros, nem
  aparecer na area do contador.
- **FR-033**: O sistema MUST guardar dos filhos so nome ou apelido, data de nascimento e o que o
  usuario escrever nos compromissos; MUST NOT pedir documento, foto, endereco, plano de saude ou
  dados da escola alem do que o usuario informar nos compromissos.
- **FR-034**: O assessor MUST NOT inventar compromissos, datas, doses ou dados de saude: se nao
  achou o dado, diz que nao achou (principio VII).

### Key Entities *(include if feature involves data)*

- **Filho**: crianca ligada a uma conta, com nome ou apelido, data de nascimento e quem cadastrou.
- **Compromisso do filho**: algo com data (ou "a marcar") ligado a um filho, com tipo, titulo, hora,
  local, observacao, antecedencia do aviso, repeticao e situacao (aberto, concluido, cancelado).
- **Aniversario de amigo**: compromisso com o nome do amigo, a ideia de presente e a situacao do
  presente (por comprar, comprado); repete todo ano.
- **Vacina aplicada**: registro de vacina com nome, dose, data e, se houver, a proxima dose.
- **Consulta de rotina**: compromisso do tipo consulta com repeticao a cada N meses.
- **Preferencia de aviso**: ja existente; ganha o tipo "compromissos dos filhos", ligado por padrao.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuario registra um compromisso de um filho em no maximo duas trocas de mensagem
  com o assessor, e o compromisso aparece na tela Filhos em ate 5 segundos.
- **SC-002**: Em testes com 30 compromissos de todos os tipos e antecedencias, 100% geram o aviso
  no dia certo, nenhum gera aviso duplicado e nenhum compromisso concluido ou cancelado gera aviso.
- **SC-003**: Em testes com 50 consultas entre contas e entre perfis de acesso, nenhuma devolve
  filho ou compromisso de outra conta ou de um perfil sem acesso a agenda.
- **SC-004**: Simulando 3 anos, um aniversario de amigo cadastrado uma vez gera exatamente um aviso
  de 3 dias antes e um de vespera por ano.
- **SC-005**: Em 20 perguntas de "o que vem por ai", a lista sai completa e na ordem correta em
  100% dos casos, e vazia quando nao ha compromissos, sem item inventado.
- **SC-006**: O usuario ve os compromissos da semana de todos os filhos em uma unica tela, a no maximo
  dois cliques a partir do menu do painel.
- **SC-007**: Em testes com 20 perguntas sobre quais vacinas ou consultas o filho precisa fazer,
  o assessor nao indica nenhuma e orienta consultar o calendario oficial e o pediatra em 100% das
  respostas.

## Assumptions

- A feature reutiliza contas, perfis de acesso e o modelo de aviso existentes. O acesso aos filhos
  segue a capacidade de agenda: titular, acesso completo e "agenda e tarefas" veem; "so gastos"
  nao.
- Quem cuida desses compromissos e a assessora de agenda (Day). Nao ha novo assessor.
- O horario padrao dos avisos e o ja usado pelo produto (09h), no fuso da conta.
- O produto nao traz calendario oficial de vacinacao nem recomenda vacinas, doses ou prazos. Isso
  evita informacao de saude errada e fica fora desta versao.
- Dados de crianca e de saude sao sensiveis. Os dados dos filhos ficam so na conta do usuario e
  seguem o principio I: nao passam por planos de IA cujos termos permitem treinar com eles fora de
  testes locais.
- Nao ha integracao com escola, plano de saude ou caderneta de vacinacao digital. Anexar documentos
  (carteirinha, exame, bilhete) a um filho fica fora desta versao.
- Nao ha grade de horarios escolares nem controle de notas.
- Compromissos entram por texto e audio. Ler foto de convite ou de bilhete fica para uma versao
  futura.
- O limite de 10 filhos por conta cobre familias comuns e protege o uso.
- A deteccao do que o usuario quis dizer ("sexta", "de 6 em 6 meses") usa o mesmo modelo de IA ja
  usado no assistente, sem novo servico externo.
