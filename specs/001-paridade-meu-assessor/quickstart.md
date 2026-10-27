# Quickstart: validar as historias da feature 001

# US1: conta compartilhada

Contratos em [contracts/](contracts/), entidades em [data-model.md](data-model.md).

## Pre-requisitos

- Node 22 (`nvm use 22`) e `npm install` na raiz e em `web/`.
- `.env` com chave de IA. WhatsApp e opcional: sem ele, os codigos aparecem no terminal.

## 1. Testes automaticos

```bash
npm run typecheck
```

```bash
npm test
```

Os testes novos em `test/core.test.ts` devem cobrir:

- convite: gerar, aceitar, cancelar, expirar, codigo reutilizado e limite de tentativas;
- isolamento: para cada perfil, cada ferramenta e cada rota recusa o que nao pode (matriz que
  atende SC-002, com pelo menos 50 combinacoes);
- `so_gastos` perguntando por receitas recebe recusa sem valores;
- lancamento de membro aparece para o titular com `created_by`;
- lembrete de membro vai para o WhatsApp do membro;
- membro removido perde sessao e deixa de ser atendido como membro;
- numero com dados proprios entra em outra conta e os dados voltam ao sair.

## 2. Painel com dados de demonstracao

```bash
npm run painel:demo
```

O seed passa a criar a conta demo com uma pessoa de perfil `so_gastos`
(`bia@assessor.local`, senha `demo1234`).

1. Entre como `demo@assessor.local`. Em Operacao > Equipe e acesso, gere um convite `completo`.
   Esperado: codigo `CONV-XXXXXX` exibido uma vez e convite na lista de pendentes.
2. Em outra janela anonima, Criar conta com o codigo e um telefone novo. Esperado: a tela mostra
   "voce vai entrar na conta de ...", pula plano e pagamento, e o codigo de ativacao aparece no
   terminal.
3. Como o novo membro, lance um gasto. Como titular, abra Transacoes. Esperado: gasto com o nome
   de quem lancou.
4. Entre como `bia@assessor.local`. Esperado: mesa Fiscal oculta, Financas sem saldo nem receitas,
   chamada direta a `/api/fiscal/...` devolve `403`.
5. Como titular, remova a Bia. Esperado: a sessao dela cai na proxima requisicao.

## 3. Pelo terminal

```bash
npm run chat
```

Com `CLI_PHONE` do titular: "quem tem acesso a conta?" lista membros; "convida meu socio so
para ver os gastos" devolve um codigo. Com `CLI_PHONE` de um membro `so_gastos`: "quanto recebi
esse mes?" recebe recusa sem valores.

## 4. Com os dois provedores

Repita o passo 3 com `AI_PROVIDER=gemini` e `AI_PROVIDER=claude` (principio III).

# US2: documentos

Contratos em [contracts/api-documentos.md](contracts/api-documentos.md) e
[contracts/ferramentas-documentos.md](contracts/ferramentas-documentos.md).

## 1. Testes automaticos

Os testes novos (arquivo `test/documentos.test.ts`) devem cobrir:

- arquivo recebido vira pendente, `guardar_documento` o guarda com pasta e titulo, e o pendente de
  outra pessoa nao e usado;
- pendente com mais de 24 horas e apagado do disco e do banco;
- foto em turno com `registrar_transacao` vira comprovante ligado ao lancamento;
- busca sem acento acha documento com acento; consulta sem resultado devolve "nenhum documento";
- limite de 20 MB por arquivo e aviso a partir de 80% de 1 GB;
- isolamento: conta A nao busca nem baixa documento da conta B; membro so gastos so baixa o
  comprovante ligado a despesa visivel; `agenda_tarefas` nao ve nenhum;
- `enviar_documento` entrega o arquivo ao callback depois da resposta em texto;
- API: listar, renomear, mover, excluir (arquivo some do disco) e `comprovanteId` em Transacoes.

## 2. Pelo terminal

O terminal nao recebe arquivo. Para testar a busca e o envio, rode `npm run seed:demo`, que passa
a guardar documentos de exemplo na conta demo, e depois:

```bash
npm run chat
```

Com `CLI_PHONE` da conta demo e `DB_PATH=data/demo.db`: "acha o contrato do apartamento" deve
listar ou enviar o contrato (o terminal imprime o caminho); "me manda o comprovante do aluguel"
idem; "acha o documento do barco" deve dizer que nao encontrou.

## 3. Painel

Em `npm run painel:demo`, entre como `demo@assessor.local`:

1. Tarefas > Documentos mostra as pastas com quantidade e o uso da conta.
2. Buscar "apartamento" acha o contrato; abrir baixa o PDF.
3. Mover o contrato para Casa e renomear; buscar de novo pelo novo titulo.
4. Excluir um documento: some da lista e do disco (`data/demo-arquivos/`).
5. Em Transacoes, um lancamento com comprovante mostra "ver comprovante".
6. Como `bia@assessor.local`: Documentos nao aparece; o comprovante do gasto dela abre pela
   transacao.

## 4. WhatsApp

Com o numero de teste: mandar um PDF com a legenda "guarda esse" (guardado e classificado), mandar
uma foto de cupom (lancamento e comprovante), mandar um PDF sem legenda e depois "sim, guarda"
(guardado), e pedir o arquivo de volta (chega como documento na conversa). Repetir com
`AI_PROVIDER=gemini` e `AI_PROVIDER=claude`.

# US3: avisos proativos

Contratos em [contracts/ferramentas-avisos.md](contracts/ferramentas-avisos.md) e
[contracts/api-avisos.md](contracts/api-avisos.md). Os avisos usam relogio injetado (`now`) nos
testes; nao e preciso esperar o dia virar.

## 1. Testes automaticos

Os testes novos (arquivo `test/avisos.test.ts`) devem cobrir:

- conta a pagar com vencimento amanha gera um aviso na hora da pessoa e nenhum segundo aviso no
  tick seguinte; paga, nao avisa; mensal paga avanca para o mes seguinte (31 de janeiro vira 28 ou
  29 de fevereiro);
- recorrencia semanal lanca uma transacao por segunda, com `recurring_id`, uma vez so mesmo com
  dois ticks; pausada nao lanca; servidor parado por 10 dias lanca so as ocorrencias dos ultimos 7;
- categoria 15% acima com diferenca maior que R$ 50 avisa com a projecao; abaixo dos pisos, nao
  avisa; segundo aviso da mesma categoria na mesma semana nao sai;
- resumo da noite conta so as areas do perfil; sem registros no dia, nao envia;
- preferencias: padroes do titular e do membro; desligar pelo `configurar_avisos` para os envios;
- envio recusado vira pendente e sai antes da resposta na proxima mensagem; pendente com mais de
  7 dias e descartado; lembrete que falha nao e reenviado a cada tick;
- `comparar_meses` com total e as tres maiores variacoes;
- permissoes: so gastos cria conta a pagar e recorrencia de despesa, nao de receita; agenda e
  tarefas nao recebe aviso de categoria nem vencimento;
- API das tres areas, inclusive `403` e `contasProximas` em `/financas`.

## 2. Terminal

Com `DB_PATH=data/demo.db` e o titular demo:

- "o condominio vence dia 8, 480 reais, todo mes" cria conta a pagar mensal;
- "paguei o condominio" registra a despesa e mostra o proximo vencimento;
- "toda segunda tem 89,90 da academia" cria a recorrencia e diz a proxima data;
- "compara meu gasto com o mes passado" traz total e tres categorias;
- "para de me avisar de categoria" e "me manda o resumo da noite as 22h" mudam as preferencias.

## 3. Painel

Em `npm run painel:demo` como `demo@assessor.local`: Financas > Contas e recorrencias lista,
cria, paga, pausa e cancela; o painel de Financas mostra as contas dos proximos 7 dias;
Operacao > Avisos liga e desliga e troca o horario, e avisa quando nao ha modelo aprovado. Como
`bia@assessor.local`: Contas e recorrencias so com despesas; Avisos com categoria e vencimentos
disponiveis e desligados.

## 4. Agendador

Com o servidor rodando e um numero de teste: cadastrar uma conta que vence amanha e mudar a hora
de `vencimentos` para a hora atual; o aviso chega em ate 30 segundos e nao se repete.

# US4: Google Agenda

Contratos em [contracts/ferramentas-agenda.md](contracts/ferramentas-agenda.md) e
[contracts/api-google.md](contracts/api-google.md).

## 1. Testes automaticos

Os testes novos (arquivo `test/google.test.ts`), com `fetch` simulado para o Google, devem cobrir:

- cifra do refresh token: o banco nunca guarda o token em claro; trocar `GOOGLE_TOKEN_KEY` impede
  decifrar;
- fluxo de conexao: `state` de uso unico e com validade; link do WhatsApp de uso unico; retorno com
  `state` de outra pessoa, vencido ou repetido nao grava nada; `access_denied` nao grava nada;
- renovacao do access token so quando faltar menos de 1 minuto;
- `criar_compromisso`: evento com duracao padrao de 60 min no fuso configurado, convidados com
  `sendUpdates=all`, Meet com `conferenceDataVersion=1`, lembrete interno ligado ao evento;
  conflito sem `confirmar_conflito` nao cria;
- sem conexao: cria so o lembrete interno e devolve o link; sem configuracao: diz que nao esta
  disponivel;
- `invalid_grant` marca `expirada`, cria o lembrete interno e avisa uma vez por dia;
- `remarcar_compromisso` faz `PATCH` e move o lembrete; `cancelar_compromisso` pede confirmacao,
  apaga e cancela o lembrete; `desconectar_google_agenda` chama o `revoke` e apaga a linha;
- perfis: so gastos recebe `Sem permissao`; a conexao de um membro nao e usada por outro;
- resumo da manha com os eventos do dia, e sem eles (com a linha de aviso) quando o Google falha;
- API: status, conectar, desconectar, `/api/agenda` com `google.eventos`.

## 2. Google Cloud (uma vez)

1. Criar um projeto em console.cloud.google.com, ativar a Google Calendar API.
2. Tela de consentimento OAuth: tipo externo, modo de teste, adicionar o proprio e-mail como
   testador, escopos `openid`, `email` e `.../auth/calendar.events`.
3. Credencial OAuth do tipo "Aplicativo da Web" com o redirect
   `http://localhost:3001/api/google/retorno` (e o do tunel, se usar).
4. No `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (32 bytes em base64:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) e
   `PAINEL_URL=http://localhost:3001`.

## 3. Painel e terminal

1. `npm run painel` (banco real, para nao misturar a conta Google com a demonstracao), entrar e em
   Agenda clicar "Conectar Google Agenda"; autorizar; a pagina de retorno diz que conectou e a
   Agenda mostra o e-mail.
2. `npm run chat` com o mesmo `CLI_PHONE`: "marca o dentista quinta as tres da tarde" cria o evento
   de 1 hora e diz quando lembra; "reuniao com ana@exemplo.com terca 10h com link" cria com convite
   e Meet; pedir o mesmo horario de novo avisa do conflito; "a reuniao de terca pode virar 11h?"
   move; "cancela o dentista" pede confirmacao e apaga.
3. Conferir tudo no Google Agenda pelo navegador.
4. "desconecta minha agenda do Google": a Agenda do painel volta a mostrar "Conectar".
5. Repetir o passo 2 com `AI_PROVIDER=gemini` e `AI_PROVIDER=claude`.

# US5: pagina publica de agendamento

Contratos em [contracts/api-agendamento.md](contracts/api-agendamento.md) e
[contracts/ferramentas-agendamento.md](contracts/ferramentas-agendamento.md). Depende da US4: o
Google Agenda de quem atende precisa estar conectado.

## 1. Testes automaticos

Os testes novos (arquivo `test/agendamento.test.ts`), com o Google simulado da US4, devem cobrir:

- configuracao: sem Google conectado a pagina nao ativa; `slug` aleatorio e troca de link;
- horarios: so dentro da janela e dos dias, respeitando antecedencia e horizonte; evento do Google
  e agendamento existente tiram os horarios sobrepostos; evento de dia inteiro nao tira; a resposta
  nao contem titulo nem convidado dos outros eventos;
- reserva: cria o evento com o cliente como convidado e o lembrete do dono; dois pedidos para o
  mesmo horario, um aceito e outro `409`; Google falhando nao deixa linha `reservando`; campo
  escondido preenchido nao grava; limites por IP e por WhatsApp; sem `aceite` recusa;
- vespera: confirmacao sai uma vez as 18h; sem modelo aprovado marca `confirmacao nao enviada` e
  avisa o dono; numero com PARAR nao recebe;
- respostas do cliente pelo webhook: `1` confirma, `2` avisa o dono, opcao escolhida move evento e
  lembrete, `PARAR` registra o opt-out, outra coisa recebe a resposta fixa; nada disso chama o
  modelo de IA; numero sem agendamento continua ignorado;
- ferramentas e API privada, inclusive `remarcar_agendamento` com tres opcoes e cancelamento.

## 2. Painel e pagina publica

Com o Google conectado (quickstart da US4) e `npm run painel`:

1. Agenda > Pagina de agendamento: escolher duracoes, dias e janela, ativar; copiar o link.
2. Em uma janela anonima, abrir o link: escolher duracao, dia e horario, preencher os dados e
   confirmar em menos de 1 minuto (SC-006). O evento aparece no Google Agenda com o cliente
   convidado, e o painel lista o agendamento.
3. Em duas janelas anonimas, escolher o mesmo horario e confirmar quase juntos: uma recebe "acabou
   de ser ocupado".
4. Com o navegador em outro fuso (emulacao de fuso do DevTools), a pagina mostra os horarios no
   fuso do cliente e avisa a diferenca.

## 3. WhatsApp

Com o numero de teste e o modelo aprovado: agendar com um WhatsApp cadastrado como destinatario,
mudar a hora do servidor para a vespera as 18h (ou criar o agendamento para amanha e rodar o
agendador), responder `1`, depois pedir ao assessor "nao vou poder atender a Camila amanha" e
responder `2` com o numero de teste. Repetir o pedido ao assessor com `AI_PROVIDER=gemini` e
`AI_PROVIDER=claude`.

# US6: mensagens a outras pessoas

Contratos em [contracts/ferramentas-contatos.md](contracts/ferramentas-contatos.md) e
[contracts/api-contatos.md](contracts/api-contatos.md).

## 1. Testes automaticos

Os testes novos (arquivo `test/contatos.test.ts`), com o WhatsApp simulado de `test/googleFalso.ts`,
devem cobrir:

- previa: sem `confirmado` nada e gravado nem enviado; o texto final tem a identificacao de quem
  pediu e o PARAR;
- contato: sem cadastro e sem telefone a ferramenta pede o numero; com telefone salva; dois
  contatos com o mesmo nome pedem para escolher; numero com 11 digitos ganha o 55;
- envio: o agendador manda o vencido uma vez, guarda o `wamid` e calcula o proximo da recorrencia;
  `statuses` do webhook passam a mensagem para entregue, lida ou falhou, e a falha avisa quem pediu;
- opt-out: numero em `client_optouts` (inclusive vindo da US5) e recusado; PARAR do contato cancela
  os recorrentes e avisa quem pediu; nenhuma mensagem sai para numero na lista (SC-007);
- limites: 21a mensagem da conta no dia e 4a para o mesmo contato recusadas; recorrente pula o dia;
- resposta do contato pelo webhook: repassada literal a quem pediu, "Recebido!" uma vez por dia,
  nada chama o modelo de IA; agendamento ativo da US5 continua com a vez; numero sem envio recente
  continua ignorado;
- cartao de contato compartilhado vira texto com nome e numero para o modelo;
- perfil so gastos recebe `Sem permissao` e `403`; outra conta nao ve nem cancela os envios.

## 2. Terminal

Com `npm run chat`: "lembra o Joao de pagar o personal todo dia 5" pede o numero; com o numero, o
assessor mostra a previa e so grava depois do "pode mandar". "O que eu pedi para mandar ao Joao?"
lista o envio; "para de cobrar o Joao" cancela. Repetir com `AI_PROVIDER=gemini` e
`AI_PROVIDER=claude`.

## 3. Painel

Agenda > Mensagens para outras pessoas: o envio recorrente aparece com o proximo dia; cancelar tira
da lista. Conferir com `npm run painel:demo`.

## 4. WhatsApp

Com o numero de teste e um segundo numero cadastrado como destinatario: pedir "avisa o Pedro
(numero de teste) que a reuniao mudou para as 15h", confirmar, ver a mensagem chegar com a
identificacao e o PARAR, responder do segundo numero e ver o repasse; responder PARAR e pedir novo
envio: o assessor diz que a pessoa pediu para nao receber.