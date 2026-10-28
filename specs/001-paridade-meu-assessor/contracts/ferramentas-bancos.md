# Contrato: bancos pelo WhatsApp (US8)

Ferramentas sincronas em `src/tools.ts`, leem so o banco local (a sincronizacao fica com o
webhook e o agendador).

| Ferramenta | Capacidade | Entrada | Saida |
| --- | --- | --- | --- |
| `bancos_conectados` | `despesas` ou `receitas` | nenhuma | bancos, situacao, ultima sincronizacao e o link de Financas > Bancos para conectar, renovar ou desconectar |
| `fatura_do_cartao` | `despesas` | `cartao?` (nome ou final) | por cartao: fatura atual (valor, fechamento, vencimento, se ja fechou), compras desde o ultimo fechamento e a ultima fatura fechada |

Sem banco conectado: explica que da para conectar em Financas > Bancos (ou que nao esta disponivel
no servidor). Lancamentos importados ja aparecem em `consultar_transacoes`, com `[banco]` na linha.

## Aviso ao titular (tipo `bancos`)

- `🏦 O acesso ao {banco} vence em {dias} dias. Renove em {link} para continuar importando.`
- `⚠️ Parei de importar do {banco}: {motivo}. Renove em {link}.`

## Prompt

"Minha fatura ja fechou?" e "no credito, quanto ja foi esse mes?": `fatura_do_cartao`. "Conecta meu
banco": `bancos_conectados` e repassar o link. Pedido de Pix, transferencia, pagamento ou
investimento: responder que o acesso ao banco e so de leitura e que o assessor nao movimenta
dinheiro.
