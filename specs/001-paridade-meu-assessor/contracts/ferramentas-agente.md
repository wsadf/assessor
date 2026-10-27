# Contrato: ferramentas do assessor para a conta compartilhada (US1)

Definidas em `src/tools.ts`, usadas igual pelo Gemini e pelo Claude (principio III). Entradas
validadas com zod; a saida e texto curto para o modelo, como nas ferramentas atuais.

## Ferramentas novas

| Ferramenta | Capacidade | Entrada | Saida |
| --- | --- | --- | --- |
| `listar_acessos` | qualquer | nenhuma | titular e membros com nome, perfil e data de entrada |
| `convidar_pessoa` | `acessos` | `perfil` (`completo`, `so_gastos`, `agenda_tarefas`), `rotulo?` | codigo, validade e texto pronto para encaminhar |
| `alterar_acesso` | `acessos` | `pessoa` (nome ou final do telefone), `perfil` | confirmacao ou lista de pessoas compativeis |
| `remover_acesso` | `acessos` | `pessoa`, `confirmado: boolean` | sem `confirmado`, pede confirmacao; com, remove |

`remover_acesso` exige duas chamadas: a primeira devolve "confirme com o usuario"; a segunda,
com `confirmado: true`, remove. Isso evita remocao por interpretacao errada do modelo.

## Capacidade das ferramentas existentes

| Ferramenta | Capacidade |
| --- | --- |
| `registrar_transacao` | `despesas` para despesa, `receitas` para receita |
| `consultar_transacoes`, resumos de mes | `despesas`; sem `receitas`, o filtro `kind = despesa` e forcado |
| `corrigir_transacao`, `excluir_transacao` | capacidade do tipo da transacao alvo |
| lembretes | `agenda` |
| tarefas | `tarefas` |

Ferramenta sem capacidade devolve ao modelo:
`"Sem permissao: o acesso de <nome> nesta conta nao inclui <area>."`
O modelo repassa isso ao usuario sem valores (cenario 3).

## Prompt

`src/prompt.ts` recebe uma linha por mensagem, junto com `[Agora: ...]`:

```text
[Quem fala: Bia, perfil so_gastos na conta de Wesley. Pode: despesas.]
```

Para o titular sem membros, a linha e omitida, mantendo o custo atual.
