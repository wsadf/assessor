# Contrato: mensagens a outras pessoas (US6)

Ferramentas em `src/tools.ts`, sincronas: o envio "agora" grava `next_run_at` no instante do pedido
e sai no proximo ciclo do agendador (ate 30 segundos), sem a ferramenta esperar a Meta. Todas
exigem `agenda` e usam a conta de `ctx.conta`; o pedido fica em nome de `ctx.membro`.

## Ferramentas novas

| Ferramenta | Entrada | Saida |
| --- | --- | --- |
| `mensagem_para_contato` | `contato` (nome), `telefone?`, `texto`, `data_hora?` (`AAAA-MM-DDTHH:mm`, nulo = agora), `recorrencia?` (`diario`, `semanal`, `mensal`), `confirmado` | sem `confirmado`: a previa com destinatario, texto final e quando; com: grava, agenda ou envia e diz o que foi feito |
| `consultar_mensagens_contato` | `contato?` | envios ativos (`#id | contato | proximo | recorrencia`) e ultimas 10 mensagens com situacao e resposta |
| `cancelar_mensagem_contato` | `id`, `confirmado` | sem `confirmado`, pede confirmacao; com, cancela os envios futuros |

Recusas que voltam como resposta (sem enviar): contato desconhecido sem `telefone` ("pergunte o
numero"), mais de um contato com o nome (lista para escolher), numero em opt-out ("pediu para nao
receber mensagens do assessor"), limite do dia, data no passado, perfil sem `agenda`.

## Mensagem ao contato (texto fixo em volta do pedido)

`Oi, {contato}! Aqui e o assessor de {usuario}. {texto} Para nao receber mais mensagens do
assessor, responda PARAR.`

Sai por `sendNotice` (modelo aprovado quando configurado). Sem modelo, a previa avisa:
`Sem o modelo aprovado da Meta, so chega se {contato} tiver escrito para este numero nas ultimas 24
horas.`

## Respostas do contato (sem IA)

| Mensagem | Efeito |
| --- | --- |
| `PARAR` (ou `pare`, `stop`) | grava o opt-out, cancela os envios recorrentes para o numero, responde `Combinado, nao mando mais mensagens.` e avisa quem pediu: `🚫 {contato} pediu para nao receber mais mensagens. Cancelei os envios para ele.` |
| qualquer outra | repassa a quem pediu: `💬 {contato} respondeu: "{texto}"`; ao contato, uma vez por dia: `Recebido! Vou repassar para {usuario}.` |

## Avisos a quem pediu

`⚠️ A mensagem para {contato} nao foi entregue: {motivo}.` (falha de envio ou `failed` da Meta) e
`⚠️ Limite de mensagens do dia atingido; o envio recorrente para {contato} fica para amanha.`

## Prompt

"Lembra o Joao de pagar o personal todo dia 5": `mensagem_para_contato` com recorrencia `mensal`
e `data_hora` no proximo dia 5, primeiro com `confirmado` falso e depois de o usuario confirmar com
verdadeiro. "Para de cobrar o Joao": `consultar_mensagens_contato` e `cancelar_mensagem_contato`.
"O Joao respondeu?": `consultar_mensagens_contato`. Nunca enviar sem a confirmacao do usuario na
conversa.
