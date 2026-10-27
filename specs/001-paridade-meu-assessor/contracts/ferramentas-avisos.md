# Contrato: ferramentas e avisos da US3

Ferramentas em `src/tools.ts`, comuns aos dois provedores (principio III). Avisos montados por
codigo em `src/avisos.ts`, sem IA (R23).

## Ferramentas novas

| Ferramenta | Capacidade | Entrada | Saida |
| --- | --- | --- | --- |
| `cadastrar_conta_pagar` | `despesas` | `descricao`, `vencimento` (data), `valor?`, `categoria?`, `mensal: boolean` | `#id descricao, vence AAAA-MM-DD, valor ou "valor variavel", mensal ou unica` |
| `listar_contas_pagar` | `despesas` | `incluir_pagas?` | contas abertas por vencimento; vencidas marcadas `VENCIDA` |
| `pagar_conta` | `despesas` | `id`, `valor?`, `data?`, `forma_pagamento?` | despesa registrada (`#tx`) e proximo vencimento se mensal; sem valor cadastrado nem informado, pede o valor |
| `cancelar_conta_pagar` | `despesas` | `id` | confirmacao |
| `criar_recorrencia` | `despesas` ou `receitas` conforme `tipo` | `tipo`, `valor`, `categoria`, `descricao`, `frequencia`, `inicio` (data), `contraparte?`, `forma_pagamento?` | `#id`, frequencia em palavras ("toda segunda") e a proxima data |
| `listar_recorrencias` | `despesas` ou `receitas` | nenhuma | ativas e pausadas, filtradas pelo perfil |
| `alterar_recorrencia` | do tipo da recorrencia | `id`, `acao` (`pausar`, `retomar`, `cancelar`), `valor?` | situacao nova |
| `comparar_meses` | `despesas` | `mes?` (`AAAA-MM`) | total e as 3 maiores variacoes por categoria (R31) |
| `configurar_avisos` | qualquer | `tipo`, `ligado: boolean`, `hora?` (0 a 23) | preferencia nova; tipo fora do perfil responde que nao se aplica |

A frequencia e a ancora vem de `inicio`: semanal repete no dia da semana de `inicio`, mensal no
dia do mes de `inicio`.

## Textos dos avisos

| Tipo | Quando | Texto |
| --- | --- | --- |
| `vencimentos` | vespera, na hora da pessoa | `📅 Amanha vence {descricao}{: R$ x}. Quando pagar, me diga "paguei {descricao}".` |
| `categoria` | uma vez por dia, na hora da pessoa; no maximo 1 por categoria por semana | `📈 {Categoria} esta {p}% acima do mesmo ponto do mes passado (R$ a contra R$ b). No ritmo de agora, o mes fecha perto de R$ c.` |
| `recorrentes` | quando o lancamento e feito | `🔁 Lancei {descricao}: R$ x em {categoria} (#tx). Para parar: "cancela a recorrencia {descricao}".` |
| `resumo_manha` | hora da pessoa | o resumo atual, com os vencimentos do dia |
| `resumo_noite` | hora da pessoa | `🌙 Hoje a equipe registrou: {n} gastos (R$ x), {n} lembretes, {n} tarefas e {n} documentos.` (so areas visiveis; nada registrado, nao envia) |

Pendentes (R29) saem na proxima mensagem da pessoa, num texto unico:
`Avisos que ficaram para depois:\n- ...`.

## Prompt

Regras acrescentadas: "paguei X" com conta a pagar cadastrada usa `pagar_conta`, nao
`registrar_transacao`; "toda segunda tem 89,90 da academia" usa `criar_recorrencia`; "para de me
avisar de ..." e "me manda o resumo da noite" usam `configurar_avisos`.
