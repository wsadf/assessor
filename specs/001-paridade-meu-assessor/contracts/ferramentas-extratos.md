# Contrato: extrato pelo WhatsApp (US8)

Ferramentas sincronas em `src/tools.ts`.

| Ferramenta | Capacidade | Entrada | Saida |
| --- | --- | --- | --- |
| `importar_extrato` | `despesas` e `receitas` | nenhuma | importa o `.ofx` pendente deste turno (ou o ultimo que a pessoa mandou): conta, periodo, criados, unidos, ignorados e estornados; apaga o arquivo pendente. Sem arquivo OFX: pede para mandar o arquivo exportado do banco |
| `contas_bancarias` | `despesas` | nenhuma | contas e cartoes importados, com saldo do ultimo extrato, data da ultima importacao e, no cartao, fechamento e vencimento |
| `fatura_do_cartao` | `despesas` | `cartao?` (nome ou final) | fatura atual (valor, fechamento, vencimento, se ja fechou) e compras do mes no credito; sem dias configurados, as compras do mes e como configurar no painel |

Lancamentos importados aparecem em `consultar_transacoes` com `[extrato]` na linha.

## Prompt

- Arquivo `.ofx` recebido: perguntar se importa; com o sim (ou se o pedido ja veio junto),
  `importar_extrato`.
- "Minha fatura ja fechou?", "no credito, quanto ja foi esse mes?": `fatura_do_cartao`.
- "Conecta meu banco": ainda nao ha conexao automatica; explicar como exportar o OFX no app do banco
  e mandar aqui ou em Financas > Extratos.
- Pix, transferencia, pagamento ou investimento: o assessor nao movimenta dinheiro, so le.
