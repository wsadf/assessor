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
| Tarefas | Davi | Tarefas por status, atrasadas, projetos; criar, editar, concluir |
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

Abra http://localhost:3001. O painel pede login.

- **Demonstração**: depois de `npm run seed:demo`, entre com `demo@assessor.local` e senha `demo1234`.
- **Conta nova**: em **Criar conta** são quatro passos: quem é você, plano, pagamento (7 dias grátis, a cobrança ainda não está ligada) e ativação. O número informado no cadastro é o mesmo que conversa com o assessor no WhatsApp, então o painel mostra os dados dele.
- **Esqueceu a senha**: o código chega no WhatsApp da conta e a senha nova já entra.

Os códigos de 6 números vão pelo WhatsApp quando `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` estão preenchidos. Sem eles, aparecem no terminal onde o painel está rodando, como `[codigo de acesso] +55 ••••• 1111 -> 123456`. Cada código vale 10 minutos e aceita 5 tentativas.

`PAINEL_TOKEN` é opcional: serve como chave de serviço no cabeçalho `x-painel-token` e enxerga os dados de `PAINEL_TELEFONE`.

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
| `src/server.ts` | Webhook: valida assinatura, ignora números não autorizados e duplicados, processa cada usuário em ordem |
| `src/agent.ts` | Monta a mensagem, escolhe o provedor de IA e grava o histórico |
| `src/prompt.ts` | Prompt de sistema comum aos dois provedores |
| `src/providers/gemini.ts` | Laço de chamadas de função com o Gemini (REST) |
| `src/providers/claude.ts` | Laço de ferramentas com o Claude (SDK da Anthropic) |
| `src/tools.ts` | Definição e execução das ferramentas de transações, lembretes e tarefas |
| `src/db.ts` | SQLite: usuários, histórico, transações, lembretes, tarefas, pesquisas |
| `src/api.ts` | API do painel: cadastro e login em `/api/auth`, uma rota por mesa para quem tem sessão |
| `src/auth.ts` | Contas, senhas (scrypt), códigos de 6 números e sessões |
| `src/painel.ts` | Sobe a API e o painel compilado, sem WhatsApp |
| `src/seed.ts` | Dados de demonstração em `data/demo.db` |
| `web/` | Painel em Vue 3 + Vue Router + Vite, gráficos em SVG próprios |
| `src/scheduler.ts` | Envia lembretes vencidos e o resumo da manhã a cada 30 segundos |
| `src/whatsapp.ts` | Envio de texto e modelo, download de mídia, leitura do webhook |
| `src/cli.ts` | Mesmo agente no terminal |

Em `docs/aprendizados-meu-assessor.md` está o que veio da entrevista do fundador do Meu Assessor e como cada ponto entrou no projeto.

## Limites deste MVP

- SQLite e fila em memória: um servidor só. Para produção, PostgreSQL e uma fila como BullMQ.
- Número de teste da Meta: até 5 destinatários cadastrados.
- O histórico enviado ao modelo são as últimas 20 mensagens de texto.
- Sem Open Finance, agenda do Google, documentos nem conta compartilhada; estão nas fases seguintes do plano.
