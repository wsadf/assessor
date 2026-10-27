# Contrato: ferramentas e mensagens do agendamento (US5)

Ferramentas em `src/tools.ts`, assincronas (falam com o Google), pela `executarFerramenta`. Todas
exigem `agenda` e usam a pagina de `ctx.membro`.

## Ferramentas novas

| Ferramenta | Entrada | Saida |
| --- | --- | --- |
| `link_de_agendamento` | nenhuma | o link da pagina ativa; sem pagina, explica como ativar no painel; sem Google, manda conectar |
| `consultar_agendamentos` | `data_inicio`, `data_fim`, `cliente?` | `#id | dia hora | cliente | situacao` |
| `remarcar_agendamento` | `id` | envia ao cliente ate 3 opcoes e responde quais foram; sem horario livre nos proximos 14 dias, diz isso e nao envia |
| `cancelar_agendamento` | `id`, `confirmado` | sem `confirmado`, pede confirmacao; com, cancela, apaga o evento e avisa o cliente |

## Mensagens ao cliente (texto fixo, sem IA)

| Momento | Texto |
| --- | --- |
| Vespera, 18h | `Oi, {cliente}! Confirmando seu horario com {nome}: {dia}, as {hora}. Responda 1 para confirmar, 2 se precisar remarcar ou PARAR para nao receber mais mensagens.` |
| Resposta 1 | `Confirmado! {nome} te espera {dia}, as {hora}.` |
| Resposta 2 | `Certo, avisei {nome}. Logo voce recebe novas opcoes.` |
| Remarcar pelo dono | `{nome} precisou remarcar o horario de {dia} as {hora}. Opcoes: 1) ... 2) ... 3) ... Responda com o numero, ou 0 se nenhuma servir.` |
| Escolha de opcao | `Prontinho! {dia}, as {hora}. Te lembro na vespera.` |
| Cancelamento | `{nome} cancelou o horario de {dia} as {hora}. Se quiser marcar outro: {link}` |
| PARAR | `Combinado, nao mando mais mensagens.` |
| Outra coisa | `Responda 1 para confirmar, 2 para remarcar ou PARAR. Para outros assuntos, fale direto com {nome}.` |

Horarios das mensagens ao cliente no fuso do profissional, com o nome do fuso quando o cliente
tiver reservado de outro (guardado na reserva). Todas saem por `sendNotice` (modelo aprovado
quando configurado).

## Avisos ao dono (tipo `agendamentos`)

`📆 Camila Prado marcou {dia} as {hora} ({duracao} min).`, `✅ Camila confirmou {dia} as {hora}.`,
`🔁 Camila pediu para remarcar {dia} as {hora}.`, `🔁 Camila escolheu {dia} as {hora}.`,
`⚠️ Nao consegui mandar a confirmacao para Camila; o WhatsApp precisa do modelo aprovado.`

## Prompt

"Nao vou poder atender a Camila amanha": `consultar_agendamentos` e depois `remarcar_agendamento`.
"Me manda meu link de agendamento": `link_de_agendamento`.
