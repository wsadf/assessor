# Contrato: cobranca pelo WhatsApp (US9)

Ferramentas sincronas em `src/tools.ts`, capacidade `receitas`.

| Ferramenta | Entrada | Saida |
| --- | --- | --- |
| `criar_cobranca` | `pagador` (ate 60), `whatsapp?`, `valor`, `descricao` (ate 72), `vencimento?` (`AAAA-MM-DD`) | `Cobranca #id: {pagador}, {valor}, {descricao}, vence {data}. Link: {link}. Copia-e-cola: {codigo}`; sem chave: explica onde cadastrar no painel |
| `consultar_cobrancas` | `situacao?` (`aberta`, `paga`, `cancelada`), `pagador?` | `#id | pagador | valor | vencimento | situacao` com as vencidas marcadas |
| `marcar_cobranca_paga` | `id`, `data?` | lanca a receita e responde com o id do lancamento |
| `cancelar_cobranca` | `id`, `confirmado` | sem `confirmado`, pede confirmacao lembrando que o codigo ja enviado continua pagavel; com, cancela |

## Aviso ao usuario

`💰 {pagador} pagou {valor} (cobranca #{id}).` quando o extrato importado confirma o pagamento.

## Prompt

- "Cobra R$ 850 do Joao pela consultoria de agosto": `criar_cobranca`; se o usuario pedir para
  mandar ao Joao, `mensagem_para_contato` com o link (previa e confirmacao da US6).
- "O Joao pagou": `consultar_cobrancas` e `marcar_cobranca_paga`. Nunca marcar paga sem o usuario
  dizer ou o extrato mostrar.
- Nota fiscal: "A emissao de nota fiscal ainda nao esta disponivel. Por enquanto, emita no site da
  prefeitura ou com o seu contador."
- Antecipar, transferir ou sacar o valor recebido: o assessor nao mexe no dinheiro; isso e feito
  no app do banco.
