# Contrato: ferramentas do assessor para documentos (US2)

Em `src/tools.ts`, comuns aos dois provedores (principio III). O "anexo da mensagem" e o ultimo
documento pendente enviado por quem fala (R12).

## Ferramentas novas

| Ferramenta | Capacidade | Entrada | Saida |
| --- | --- | --- | --- |
| `guardar_documento` | `documentos` | `pasta` (lista padrao), `titulo`, `descricao`, `data_documento?` | confirmacao com id, pasta e uso da conta; aviso a partir de 80% |
| `buscar_documentos` | `documentos` | `consulta`, `pasta?`, `data_inicio?`, `data_fim?` | ate 8 candidatos: `#id titulo (pasta, data)` com descricao curta; ou "nenhum documento" |
| `enviar_documento` | `documentos` ou ligacao visivel (R18) | `id` | "Arquivo #id sera enviado apos a resposta." ou "nao encontrado" |
| `mover_documento` | `documentos` | `id`, `pasta?`, `titulo?` | antes e depois |
| `excluir_documento` | `documentos` | `id`, `confirmado: boolean` | sem `confirmado`, pede confirmacao; com, exclui |
| `listar_pastas` | `documentos` | nenhuma | pastas com quantidade e uso total |

`guardar_documento` sem anexo pendente devolve "Nenhum arquivo recebido para guardar. Peca ao
usuario para enviar." O modelo nunca inventa um id.

## Comportamento automatico

- Mensagem com foto ou PDF em que `registrar_transacao` cria um lancamento: o anexo pendente e
  guardado e ligado (R15). A resposta da ferramenta acrescenta "Comprovante guardado (#id)."
- Membro sem `documentos` que manda uma foto de cupom: o lancamento e o comprovante sao guardados
  (ligados a despesa que ele pode ver); pedir "guarda esse contrato" devolve `Sem permissao`.

## Prompt

Regras acrescentadas ao prompt de sistema:

- Arquivo recebido sem pedido: diga em uma frase o que parece ser e pergunte se guarda e em que
  pasta. Com pedido ("guarda esse"), chame `guardar_documento` com titulo e descricao ricos em
  nomes, datas, valores e numeros que aparecem no documento.
- Pedido de documento: chame `buscar_documentos`; um candidato claro, `enviar_documento`; varios,
  liste ate 5 e pergunte qual; nenhum, diga que nao achou.

## Provedores

`UserInput` ganha `document?: Media & { filename: string }`. Gemini envia como `inlineData`;
Claude, como bloco `document` (PDF) ou `image`. Arquivos acima de 5 MB ou fora de PDF e imagem nao
vao ao modelo: o texto do usuario recebe `[arquivo nome.ext, 12 MB, nao lido]`.
