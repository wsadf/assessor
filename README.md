# Assessor MVP

Assessor de IA no WhatsApp que registra gastos e receitas e manda lembretes. Você conversa por texto, áudio ou foto de nota fiscal, e a IA decide o que registrar usando ferramentas. Funciona com o Gemini (padrão) ou com o Claude, escolhido em `AI_PROVIDER` no `.env`.

O que já funciona:

- Registrar, consultar, corrigir e excluir gastos e receitas ("gastei 62 na farmácia", "quanto gastei de mercado esse mês?", "o valor é 92")
- Pessoa ou loja em cada lançamento e consultas por ela, por item e por valor ("quanto mandei de Pix pro João?", "quanto gastei com o relógio?", "onde gastei esses 200?")
- Compras parceladas, com as parcelas futuras já lançadas ("comprei a TV em 10x de 150")
- Foto de nota fiscal ou comprovante vira lançamento
- Mensagem de voz (o Gemini ouve o áudio direto; com o Claude, precisa de uma chave de transcrição)
- Lembretes únicos ou recorrentes ("me lembra do remédio todo dia 20h")
- Resumo da manhã com os gastos de ontem, o total do mês e os lembretes do dia
- Tarefas com prazo, prioridade e projeto ("cria a tarefa de revisar o contrato até quarta")
- Painel web em Vue com seis mesas: Finanças, Fiscal, Agenda, Tarefas, Operação e Pesquisas
- Conta compartilhada: o titular convida família, sócio ou equipe por código; cada pessoa usa o próprio WhatsApp, alimenta a mesma conta e vê só o que o perfil dela libera
- Documentos: mande um PDF ou foto e diga "guarda esse"; o assessor lê, dá um nome, põe na pasta certa e devolve o arquivo quando você pede ("me manda o contrato do apartamento")
- Avisos sem precisar pedir: contas a pagar na véspera do vencimento, categoria gastando acima do mês passado, lançamentos recorrentes ("toda segunda tem 89,90 da academia") e resumos da manhã e da noite
- Google Agenda (opcional): "marca o dentista quinta às 15h" vai direto para o calendário, com convidados, link do Meet e aviso de conflito

## Requisito

Node 22 ou mais novo. Com o nvm: `nvm use 22`. O `better-sqlite3` é compilado para a versão do Node ativa na instalação; se trocar de versão, rode `npm rebuild better-sqlite3`.

## 1. Testar no terminal (5 minutos)

Precisa só de uma chave de IA. Com o Gemini (padrão), crie a chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Com o Claude, em [console.anthropic.com](https://console.anthropic.com) > API Keys, e troque `AI_PROVIDER=claude`.

```bash
cp .env.example .env
```

Preencha `GEMINI_API_KEY` (ou `ANTHROPIC_API_KEY`) no `.env` e rode:

```bash
npm run chat
```

Escreva como no WhatsApp. Os dados ficam em `data/assessor.db`.

## Painel web

O painel mostra os mesmos dados do chat e do WhatsApp, organizados em mesas, cada uma com um assessor:

| Mesa | Assessor | O que mostra |
| --- | --- | --- |
| Finanças | Bento | Saldo do período, maiores saídas, fim do mês projetado, categorias, renda média e variação, parcelas já comprometidas, pulso do mês; telas de Transações (lançar, parcelar, editar, excluir), Categorias, Pessoas e lojas, Formas de pagamento e Análises (gráficos reorganizáveis e pedidos de gráfico) |
| Fiscal | Clara | Receitas do mês como base de faturamento e o histórico de 6 meses. A emissão de nota fiscal ainda não está ligada |
| Agenda | Lia | Lembretes por dia, próximos compromissos, as duas próximas semanas e criação de lembretes |
| Tarefas | Davi | Tarefas por status, atrasadas, projetos; criar, editar, concluir; tela de Documentos |
| Operação | Otto | Registros por mês e a equipe de assessores |
| Pesquisas | Nina | Balcão de pesquisas. A busca na internet ainda não está ligada no assessor |

Para ver com dados de demonstração (gravados em `data/demo.db`, separado do banco real):

```bash
npm run painel:demo
```

Para ver os seus dados reais:

```bash
npm run painel
```

No topo, o botão **Conversar no WhatsApp** abre a conversa com o assessor, já com uma mensagem para o assessor da mesa aberta. Ele usa `WHATSAPP_NUMERO` do `.env` ou, se estiver vazio, descobre o número pelo app da Meta (`WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`). Sem nenhum dos dois, o botão explica como configurar.

Abra http://localhost:3001. A página inicial apresenta o produto, com equipe, planos e perguntas frequentes, e leva para **Entrar** ou **Criar conta**. As mesas pedem login.

- **Demonstração**: depois de `npm run seed:demo`, entre com `demo@assessor.local` e senha `demo1234`. Para ver o painel como membro de perfil só gastos da mesma conta, entre com `bia@assessor.local` e a mesma senha.
- **Conta nova**: em **Criar conta** são quatro passos: quem é você, plano, pagamento (7 dias grátis, a cobrança ainda não está ligada) e ativação. O número informado no cadastro é o mesmo que conversa com o assessor no WhatsApp, então o painel mostra os dados dele.
- **Esqueceu a senha**: o código chega no WhatsApp da conta e a senha nova já entra.

Os códigos de 6 números vão pelo WhatsApp quando `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` estão preenchidos. Sem eles, aparecem no terminal onde o painel está rodando, como `[codigo de acesso] +55 ••••• 1111 -> 123456`. Cada código vale 10 minutos e aceita 5 tentativas.

`PAINEL_TOKEN` é opcional: serve como chave de serviço no cabeçalho `x-painel-token` e enxerga os dados de `PAINEL_TELEFONE`.

### Conta compartilhada

Em **Operação > Equipe e acesso** (ou pelo WhatsApp: "convida meu sócio só para ver os gastos"), o titular gera um código `CONV-XXXXXX`. Ele vale 7 dias, serve uma vez e pode ser cancelado. A pessoa convidada marca **Tenho um código de convite** em **Criar conta**, confirma o próprio WhatsApp e entra na conta, sem passar por plano e pagamento.

| Perfil | Vê e faz |
| --- | --- |
| Titular | tudo, e gerencia quem tem acesso |
| Acesso completo | gastos, receitas, agenda e tarefas |
| Só gastos | registra e vê só despesas; sem receitas, saldo nem mesa Fiscal |
| Agenda e tarefas | só lembretes e tarefas; nada de dinheiro |

A permissão vale no WhatsApp e no painel: o assessor recusa o que o perfil não libera, sem citar valores. Cada pessoa tem a própria conversa; o lembrete vai para o WhatsApp de quem pediu; Transações mostra quem lançou. Remover alguém derruba a sessão dela no painel, e o que ela lançou continua na conta. Quem já usava o assessor sozinho e entra numa conta compartilhada tem os dados antigos guardados à parte, que voltam se sair.

Ainda não dá para transferir a titularidade, excluir a conta nem entrar na conta por mensagem no WhatsApp.

### Documentos

Pelo WhatsApp, mande um PDF ou uma foto. Com a legenda "guarda esse" (ou respondendo "sim" quando o assessor perguntar), ele lê o arquivo e guarda numa das pastas: Boletos, Notas fiscais, Comprovantes, Contratos, Casa, Carro, Saúde, Trabalho, Pessoais e Outros. A foto de um cupom que vira lançamento já fica guardada como comprovante dele. Para pegar de volta, descreva o documento ("acha o comprovante do aluguel") e o arquivo chega na conversa.

No painel, **Tarefas > Documentos** lista as pastas, busca, abre, renomeia, move e exclui. Em Transações, o lançamento com comprovante mostra "ver comprovante".

- Limites: 20 MB por arquivo e 1 GB por conta, com aviso a partir de 80%.
- A IA lê PDF e imagem de até 5 MB. Outros formatos (DOCX, XLSX) ou arquivos maiores são guardados, mas o assessor vê só o nome e a legenda.
- Arquivo que chega e não é guardado em 24 horas é apagado.
- Os arquivos ficam em `data/assessor-arquivos/` (ou `data/demo-arquivos/` na demonstração), fora do Git.
- Quem tem acesso completo vê todos os documentos; perfis só gastos e agenda e tarefas não veem a tela, e o só gastos abre apenas o comprovante dos gastos que já enxerga.
- Ainda não dá para enviar arquivo pelo painel nem criar pastas próprias.

### Avisos, contas a pagar e recorrências

Pelo WhatsApp: "o condomínio vence dia 8, 480 reais, todo mês" cadastra uma conta a pagar; "paguei o condomínio" lança a despesa e passa o vencimento para o mês seguinte. Fatura de cartão entra como conta mensal sem valor fixo, e o valor é informado ao pagar. "Toda segunda tem 89,90 da academia" cria uma recorrência, lançada sozinha em cada data. No painel, **Finanças > Contas e recorrências** faz o mesmo, e o painel de Finanças mostra o que vence nos próximos 7 dias.

| Aviso | Quando | Padrão do titular | Padrão de membro |
| --- | --- | --- | --- |
| Vencimentos | véspera, 9h | ligado | desligado |
| Categoria acima do normal | 15% acima do mesmo ponto do mês passado (diferença acima de R$ 50 e mês passado com pelo menos R$ 100), no máximo uma vez por semana | ligado | desligado |
| Lançamentos recorrentes | quando o lançamento é feito, a partir das 9h | ligado | desligado |
| Resumo da manhã | `DAILY_SUMMARY_HOUR` | ligado | desligado |
| Resumo da noite | 21h | desligado | desligado |

Cada pessoa liga, desliga e escolhe o horário em **Operação > Avisos** ou pelo WhatsApp ("para de me avisar de categoria", "me manda o resumo da noite às 22h"). Os avisos são montados com os números do banco, sem IA, e cada um sai uma vez só. Se o servidor ficar parado, as recorrências lançam no máximo os últimos 7 dias.

Sem `WHATSAPP_NOTICE_TEMPLATE`, avisos e lembretes só chegam se a pessoa falou com o assessor nas últimas 24 horas. O que a Meta recusar fica guardado e sai na próxima mensagem da pessoa, antes da resposta; depois de 7 dias é descartado.

### Google Agenda

Cada pessoa conecta a própria conta Google: pela mesa de **Agenda** (botão "Conectar Google Agenda") ou pedindo no WhatsApp ("conecta minha agenda do Google"), que manda um link de uso único válido por 15 minutos. Depois disso:

- "marca o dentista quinta às 15h" cria o evento de 1 hora no calendário principal e o lembrete no WhatsApp 1 hora antes;
- "reunião com ana@exemplo.com terça 10h com link" convida por e-mail e cria o link do Meet;
- se o horário já estiver ocupado, o assessor avisa e pergunta se marca mesmo assim;
- "a reunião de terça pode virar 11h?" move o evento (os convidados são avisados pelo Google) e o lembrete junto;
- o resumo da manhã traz os compromissos do dia.

Sem conta conectada, tudo funciona como antes: o compromisso vira lembrete no WhatsApp e o assessor oferece o link para conectar. Na conta compartilhada, a agenda é de cada pessoa: o Google do titular não é usado quando um membro pede.

O assessor só pede a permissão `calendar.events` (ver e editar eventos), nada de contatos ou e-mail. O acesso fica cifrado no banco e "desconecta minha agenda do Google" (ou o botão Desconectar) revoga no Google e apaga.

**Configurar (uma vez):**

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto e ative a **Google Calendar API**.
2. Em **Tela de consentimento OAuth**: tipo externo, modo de teste, adicione como testadores os e-mails que vão conectar, e os escopos `openid`, `email` e `.../auth/calendar.events`.
3. Em **Credenciais**, crie um ID do cliente OAuth do tipo **Aplicativo da Web** com o URI de redirecionamento `PAINEL_URL/api/google/retorno` (por exemplo `http://localhost:3001/api/google/retorno`; com túnel, cadastre também o endereço do túnel).
4. No `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PAINEL_URL` e `GOOGLE_TOKEN_KEY`, gerada com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Sem esses quatro valores, a mesa de Agenda mostra "Google Agenda não configurada neste servidor" e o resto segue igual.

**Limites do Google:** com o app em modo de teste, só os testadores cadastrados conseguem conectar e o acesso vence em 7 dias (o assessor avisa e manda o link para reconectar). Para abrir a qualquer pessoa, o escopo `calendar.events` é sensível e o Google exige a verificação do app.

No WhatsApp, o membro é atendido se o titular estiver em `ALLOWED_NUMBERS`. O número de teste da Meta, porém, só entrega para os 5 destinatários cadastrados no app: cadastre também o número de cada membro (seção 2.1, passo 5).

### Página de agendamento

Quem atende clientes ativa uma página pública em que o cliente marca sozinho um horário livre. Precisa do Google Agenda conectado: é ele que diz o que está livre, e o horário marcado vira evento nele.

- **Ativar:** na mesa de **Agenda**, bloco "Página de agendamento": nome que o cliente vê, durações (15 a 120 min), dias da semana, janela de atendimento, antecedência mínima e até quantos dias à frente. O link é `PAINEL_URL/agendar/<código aleatório>`; "Gerar novo link" troca o código e o antigo para de funcionar. Pelo WhatsApp: "me manda meu link de agendamento".
- **O que o cliente vê:** o nome exibido, as durações, um calendário só com os dias de atendimento e os horários livres no fuso do navegador dele. Nunca vê título, convidados ou qualquer outro dado da sua agenda.
- **Na reserva:** o cliente informa nome, e-mail e WhatsApp e aceita receber a confirmação. O evento entra no seu Google Agenda com o cliente convidado (o Google manda o convite), você recebe o lembrete 1 hora antes e o aviso "📆 Camila marcou...". Dois clientes no mesmo horário: só um consegue.
- **Na véspera, às 18h:** o cliente recebe a confirmação no WhatsApp. Como ele quase nunca falou com o número nas últimas 24 horas, só sai com o modelo aprovado (`WHATSAPP_NOTICE_TEMPLATE`, seção 4). Sem modelo, a mensagem não é enviada, o agendamento aparece com "confirmação não enviada" e você é avisado.
- **Respostas do cliente:** `1` confirma, `2` pede para remarcar (você é avisado) e `PARAR` faz o número não receber mais nada. Qualquer outra coisa recebe a lista dessas opções. O cliente nunca conversa com a IA nem vê dados da sua conta.
- **Remarcar:** "não vou poder atender a Camila amanhã" faz o assessor mandar ao cliente até três horários livres dos próximos 14 dias. A escolha dele move o evento e o lembrete. O painel também tem remarcar e cancelar em cada agendamento.
- **Contra reservas falsas:** campo escondido que só robô preenche, até 5 reservas por IP por hora e 3 por WhatsApp por dia.
- **Privacidade:** nome, e-mail e WhatsApp do cliente são apagados 90 dias depois do horário.

Fora desta versão: janelas diferentes por dia, intervalo entre atendimentos, feriados, cobrança na reserva, lembrete por e-mail e mais de uma página por pessoa. Com o número de teste da Meta, o cliente também precisa estar entre os 5 destinatários cadastrados no app.

Para desenvolver com recarga automática, em dois terminais:

```bash
npm run painel:api:demo
```

```bash
npm run dev --prefix web
```

E abra http://localhost:5173.

## 2. Ligar ao seu WhatsApp

O WhatsApp Cloud API da Meta dá um número de teste gratuito, que conversa com até 5 números cadastrados por você. Não precisa de empresa verificada para isso.

### 2.1 Criar o app na Meta

1. Entre em [developers.facebook.com](https://developers.facebook.com) com sua conta do Facebook e clique em **Criar app**.
2. Escolha o caso de uso **Outro** e o tipo **Empresa**. Dê um nome, por exemplo "Assessor MVP".
3. No painel do app, adicione o produto **WhatsApp** e siga até **Configuração da API**.
4. Nessa tela você encontra:
   - **Token de acesso temporário**: copie para `WHATSAPP_TOKEN`. Ele expira em 24 horas (veja 2.5 para um token fixo).
   - **Identificação do número de telefone** (Phone number ID): copie para `WHATSAPP_PHONE_NUMBER_ID`.
5. No campo **Para**, adicione o seu número pessoal e confirme o código que chega no seu WhatsApp.
6. Em **Configurações do app > Básico**, copie a **Chave secreta do app** para `WHATSAPP_APP_SECRET`.
7. No `.env`, coloque seu número em `ALLOWED_NUMBERS` (só dígitos, com 55 e DDD, ex.: `5511999999999`) e invente um texto para `WHATSAPP_VERIFY_TOKEN`.

### 2.2 Subir o servidor e abrir um túnel

A Meta precisa de uma URL pública com HTTPS para entregar as mensagens. Em um terminal:

```bash
npm start
```

Em outro terminal, abra um túnel para a porta 3000. Com o Cloudflare (instale uma vez com `winget install Cloudflare.cloudflared`):

```bash
cloudflared tunnel --url http://localhost:3000
```

Ele mostra uma URL como `https://algo-aleatorio.trycloudflare.com`. O ngrok também serve (`ngrok http 3000`).

### 2.3 Cadastrar o webhook

1. No painel do app, vá em **WhatsApp > Configuração**.
2. Em **Webhook**, clique em **Editar**:
   - URL de callback: `https://SUA-URL/webhook`
   - Token de verificação: o mesmo texto de `WHATSAPP_VERIFY_TOKEN`
3. Clique em **Verificar e salvar**. O log do servidor mostra o `GET /webhook`.
4. Em **Campos do webhook**, clique em **Gerenciar** e assine **messages**.

### 2.4 Conversar

Mande "oi" do seu WhatsApp pessoal para o número de teste (aparece em Configuração da API). Exemplos:

- `gastei 62 na farmácia no débito`
- `recebi 800 do freela`
- `quanto gastei esse mês?`
- `corrige o último, foi 54`
- foto de um cupom fiscal
- `me lembra de pagar o condomínio dia 10 às 9h, todo mês`
- `quais lembretes eu tenho?`

### 2.5 Token que não expira

O token temporário vence em 24 horas. Para um fixo: no [Gerenciador de Negócios](https://business.facebook.com) > Configurações > Usuários do sistema, crie um usuário do sistema administrador, atribua o app a ele e gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.

## 3. Áudio

Com o Gemini, não precisa configurar nada: a mensagem de voz vai direto para o modelo.

Com o Claude, preencha `TRANSCRIPTION_API_KEY`. O padrão usa o Whisper da OpenAI; qualquer serviço compatível com `/audio/transcriptions` funciona trocando `TRANSCRIPTION_BASE_URL` e `TRANSCRIPTION_MODEL` (o Groq, por exemplo, com `whisper-large-v3`). Sem a chave, o assessor responde que ainda não entende áudio.

## 4. Lembretes depois de 24 horas sem conversa

O WhatsApp só permite mensagem livre até 24 horas depois da última mensagem do usuário. Fora disso, só modelo aprovado. Sem modelo, um lembrete marcado para daqui a três dias só chega se você tiver falado com o assessor nas últimas 24 horas.

Para resolver:

1. Em **WhatsApp > Gerenciador de modelos**, crie um modelo da categoria **Utilidade**, idioma **Português (BR)**, nome `aviso_assessor`, com o corpo `Aviso do seu assessor: {{1}}`.
2. Depois de aprovado (costuma levar minutos), coloque `WHATSAPP_NOTICE_TEMPLATE=aviso_assessor` no `.env`.

## Redes com inspeção SSL

Algumas redes trocam o certificado das conexões HTTPS, e o Node passa a recusar as APIs externas com o erro `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Se for o caso, exporte o certificado raiz dessa rede em formato PEM para `certs/ca-extra.pem`: os scripts `npm start`, `npm run chat`, `npm run painel` e `npm test` iniciam o Node com `NODE_EXTRA_CA_CERTS` apontando para ele. Sem o arquivo, os scripts seguem normalmente. Para o `npm install`, crie um `.npmrc` local com `cafile=certs/ca-extra.pem`. A pasta `certs/` e o `.npmrc` ficam fora do Git.

Nessas redes o túnel também pode ser bloqueado. Se o `cloudflared` não conectar, teste de outra rede ou publique o projeto num serviço como Railway ou Render.

## Custo e modelo

**Gemini (padrão):** usa `gemini-3.5-flash-lite`, rápido e barato, com `gemini-3.8-flash` como reserva quando o principal estiver sobrecarregado. Os dois são trocáveis em `GEMINI_MODEL` e `GEMINI_FALLBACK_MODEL`. A chamada é feita direto pela API REST, sem o SDK do Google. O Gemini tem uma cota gratuita, mas os termos do Google permitem usar os dados dela para melhorar os produtos deles: para dados financeiros de outras pessoas, use o plano pago.

**Claude:** o padrão é `claude-opus-5-5` com esforço `low`. Para reduzir custo, troque no `.env` por `CLAUDE_MODEL=claude-sonnet-5-5` ou `claude-haiku-5-5`. O prompt de sistema e as ferramentas usam cache, então a parte repetida de cada chamada sai mais barata.

O agente usa o fallback do servidor da Anthropic (`fallbacks: "default"`): se um classificador de segurança recusar um pedido, a API refaz a chamada em outro modelo automaticamente.

## Como está organizado

| Arquivo | Papel |
| --- | --- |
| `src/server.ts` | Webhook: valida assinatura, ignora números não autorizados e duplicados, manda o cliente com agendamento para as respostas fixas, processa cada usuário em ordem |
| `src/agent.ts` | Monta a mensagem, escolhe o provedor de IA e grava o histórico |
| `src/prompt.ts` | Prompt de sistema comum aos dois provedores |
| `src/providers/gemini.ts` | Laço de chamadas de função com o Gemini (REST) |
| `src/providers/claude.ts` | Laço de ferramentas com o Claude (SDK da Anthropic) |
| `src/tools.ts` | Definição e execução das ferramentas de transações, lembretes e tarefas |
| `src/db.ts` | SQLite: usuários, histórico, transações, lembretes, tarefas, pesquisas |
| `src/api.ts` | API do painel: cadastro e login em `/api/auth`, uma rota por mesa para quem tem sessão |
| `src/auth.ts` | Contas, senhas (scrypt), códigos de 6 números e sessões |
| `src/conta.ts` | Conta compartilhada: convites, membros, contexto de quem fala e a visão dos dados por perfil |
| `src/permissoes.ts` | Perfis e o que cada um pode ver e fazer |
| `src/documentos.ts` | Documentos: arquivo no disco, pastas, busca sem acento (FTS5), pendentes e quem vê cada um |
| `src/google.ts` | Google Agenda: conexão com código e link de uso único, acesso cifrado, renovação, e eventos (listar, conflito, criar com Meet, mover, apagar) por REST |
| `src/agendamento.ts` | Página de agendamento: configuração e link, horários livres, reserva sem sobreposição, remarcação, textos ao cliente e respostas dele sem IA |
| `src/avisos.ts` | Contas a pagar, recorrências, categoria acima do normal, comparativo, preferências de aviso, registro contra repetição e fila de avisos não entregues |
| `src/painel.ts` | Sobe a API e o painel compilado, sem WhatsApp |
| `src/seed.ts` | Dados de demonstração em `data/demo.db` |
| `web/` | Painel em Vue 3 + Vue Router + Vite, gráficos em SVG próprios |
| `src/scheduler.ts` | A cada 30 segundos: lembretes vencidos, lançamentos recorrentes, os avisos de cada pessoa no horário dela e a confirmação da véspera aos clientes |
| `src/whatsapp.ts` | Envio de texto e modelo, download de mídia, leitura do webhook |
| `src/cli.ts` | Mesmo agente no terminal |

Em `docs/aprendizados-meu-assessor.md` está o que veio da entrevista do fundador do Meu Assessor e como cada ponto entrou no projeto.

## Limites deste MVP

- SQLite e fila em memória: um servidor só. Para produção, PostgreSQL e uma fila como BullMQ.
- Número de teste da Meta: até 5 destinatários cadastrados.
- O histórico enviado ao modelo são as últimas 20 mensagens de texto.
- Sem Open Finance; está nas fases seguintes do plano (`specs/001-paridade-meu-assessor`).
- Só o calendário principal do Google; Outlook, iCloud e agendas secundárias ficam de fora.
- Arquivos no disco do servidor: para mais de um servidor, armazenamento de objetos (S3, R2).
