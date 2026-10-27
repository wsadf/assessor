# Data Model: Conta compartilhada (US1)

Decisoes em [research.md](research.md). Tudo em SQLite, criado ou migrado em `openDb` e
`prepararTabelas`, no mesmo estilo de `ALTER TABLE ... ADD COLUMN` ja usado.

## Conta

Nao ha tabela nova. A conta e o registro de `users` do titular; o telefone dele e a chave usada
na coluna `phone` das tabelas de dados.

## account_members (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| member_phone | TEXT PK | so digitos, com DDI; um numero em no maximo uma conta ativa (FR-006) |
| account_phone | TEXT NOT NULL | telefone do titular; diferente de member_phone |
| role | TEXT NOT NULL | `completo`, `so_gastos`, `agenda_tarefas` |
| invite_id | INTEGER | convite usado para entrar |
| joined_at | TEXT NOT NULL | data de entrada |
| removed_at | TEXT | preenchido na remocao; membro removido nao conta como ativo |

Indice: `(account_phone, removed_at)`.

O titular nao tem linha aqui: perfil `titular` e quem tem `phone == account_phone`.

Reentrada: se o mesmo numero entrar de novo, a linha e atualizada (novo `account_phone`, `role`,
`joined_at`, `removed_at = NULL`).

## account_invites (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| account_phone | TEXT NOT NULL | conta que convida |
| code_hash | TEXT NOT NULL UNIQUE | SHA-256 do codigo `CONV-XXXXXX` |
| code_hint | TEXT NOT NULL | ultimos 2 caracteres, para a lista de pendentes |
| role | TEXT NOT NULL | perfil que o convidado recebe |
| label | TEXT | nome opcional ("Bia", "socio") |
| expires_at | TEXT NOT NULL | criacao + 7 dias |
| accepted_by | TEXT | telefone de quem usou |
| accepted_at | TEXT | |
| canceled_at | TEXT | |
| created_at | TEXT NOT NULL | |

Estados e transicoes:

```text
pendente --aceitar--> aceito
pendente --cancelar--> cancelado
pendente --tempo--> expirado (calculado: expires_at < agora e sem accepted_at/canceled_at)
```

Aceito, cancelado e expirado sao finais. Um codigo so funciona no estado pendente.

## invite_attempts (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| phone | TEXT NOT NULL | quem tentou |
| created_at | TEXT NOT NULL | |

Limite: 5 tentativas erradas por telefone em 15 minutos (R6).

## Colunas novas em tabelas existentes

| Tabela | Coluna | Regra |
| --- | --- | --- |
| transactions | created_by TEXT | telefone de quem lancou; nulo = titular |
| reminders | created_by TEXT | idem |
| reminders | notify_phone TEXT | quem recebe o aviso; nulo = `phone` |
| tasks | created_by TEXT | idem |

## Contexto de quem fala (em memoria)

Resolvido a cada mensagem, chamada de terminal ou requisicao do painel:

| Campo | Origem |
| --- | --- |
| membro | telefone de quem fala |
| conta | `account_members.account_phone` se ativo, senao o proprio telefone |
| perfil | `titular` se membro == conta, senao `account_members.role` |
| nome | `users.name` do membro |

As funcoes do repo recebem `conta`; o historico usa `membro`; as escritas gravam
`created_by = membro`.

## Capacidades por perfil

Tabela em [research.md](research.md#r5-perfis-e-onde-a-permissao-e-aplicada). Capacidades:
`despesas`, `receitas`, `agenda`, `tarefas`, `acessos`.
