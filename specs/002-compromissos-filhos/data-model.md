# Data Model: Compromissos dos filhos

Decisoes em [research.md](research.md). SQLite, criado em `prepararTabelasFilhos(db)`, chamada em
`openDb` depois de `prepararTabelasCobrancas`. Datas em texto `YYYY-MM-DD`, hora em `HH:MM`, no fuso
da conta. Toda coluna `phone` e o telefone do titular (a conta).

## children (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | conta dona do filho |
| created_by | TEXT NOT NULL | membro que cadastrou |
| name | TEXT NOT NULL | 1 a 40 caracteres; unico por conta sem acento e sem diferenca de maiusculas (FR-002) |
| birth_on | TEXT | data de nascimento; nao pode ser futura nem ter mais de 25 anos |
| approx_age | INTEGER | idade informada quando nao ha data de nascimento (0 a 25) |
| approx_age_on | TEXT | dia em que `approx_age` foi informada, para calcular a idade depois |
| created_on | TEXT NOT NULL | dia do cadastro no fuso da conta; o aviso de aniversario nao sai antes dele (R5) |
| created_at | TEXT NOT NULL | |

- Indice: `(phone)`. Limite de 10 por conta, conferido na criacao.
- Um filho tem `birth_on` ou `approx_age`, nunca os dois. Sem `birth_on` nao ha aviso de
  aniversario do filho (cenario 1 da US1).
- Idade exibida: pela data de nascimento; senao `approx_age` mais os anos inteiros desde
  `approx_age_on`.

## child_events (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | conta |
| created_by | TEXT NOT NULL | membro que registrou |
| child_id | INTEGER NOT NULL | filho; apagado junto com ele |
| kind | TEXT NOT NULL | `escola`, `aniversario_amigo`, `vacina`, `consulta`, `outro` |
| title | TEXT NOT NULL | 1 a 80 caracteres |
| subject | TEXT | disciplina, so em `escola` |
| friend_name | TEXT | nome do amigo, so em `aniversario_amigo` (1 a 40) |
| gift_idea | TEXT | ideia de presente, ate 80, so em `aniversario_amigo` |
| gift_status | TEXT | `por_comprar` ou `comprado`, so em `aniversario_amigo` (padrao `por_comprar`) |
| place | TEXT | ate 80 |
| notes | TEXT | ate 300 |
| due_on | TEXT | data; NULL = "a marcar" (FR-007) |
| due_time | TEXT | `HH:MM`, so com `due_on` |
| lead_days | INTEGER | 0 a 60; NULL = padrao do tipo (R5) |
| repeat_months | INTEGER | 1 a 24; `aniversario_amigo` usa 12 fixo; NULL = nao repete |
| anchor_md | TEXT | `MM-DD` original, so quando `repeat_months` e 12 |
| status | TEXT NOT NULL | `aberto`, `concluido`, `cancelado` (padrao `aberto`) |
| done_at | TEXT | preenchido ao concluir |
| created_on | TEXT NOT NULL | dia da criacao no fuso da conta, usado na regra de aviso (R5) |
| created_at | TEXT NOT NULL | |

- Indices: `(phone, status, due_on)` e `(child_id)`.
- Regras de consistencia: `friend_name`, `gift_*` e `subject` so fazem sentido no tipo certo; a
  camada de dominio recusa o resto, nao o SQL.
- Compromisso sem `due_on` nao gera aviso de data (entra no lembrete semanal, FR-017).

### Estados

```text
aberto --concluir--> concluido   (consulta com repeat_months cria a proxima linha, aberta)
aberto --cancelar--> cancelado
concluido --reabrir--> aberto
cancelado --reabrir--> aberto
aberto (aniversario_amigo, data < hoje) --avancar--> aberto, data + 12 meses, presente por_comprar
```

Concluido e cancelado nao geram aviso. Remarcar muda `due_on` e `due_time`; os avisos se refazem
sozinhos porque a chave de deduplicacao inclui a data.

## child_vaccines (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | conta |
| created_by | TEXT NOT NULL | |
| child_id | INTEGER NOT NULL | filho; apagado junto com ele |
| name | TEXT NOT NULL | nome da vacina, 1 a 60 |
| dose | TEXT | "1a dose", "reforco"; ate 20 |
| applied_on | TEXT NOT NULL | data da aplicacao; nao pode ser futura |
| next_event_id | INTEGER | compromisso da proxima dose, se houver |
| created_at | TEXT NOT NULL | |

Indice: `(child_id, applied_on)`.

## Aniversario do filho (derivado)

Nao e tabela. Para cada filho com `birth_on`, a proxima ocorrencia e o proximo `MM-DD` igual ou
posterior a hoje (29 de fevereiro vale 28 em ano comum). Entra nas listagens como item `virtual` do
tipo `aniversario`, com a idade que o filho completa.

## Preferencia de aviso (existente)

`notice_prefs.kind` ganha o valor `filhos`. A migracao e a que `atualizarTiposDeAviso` ja faz:
recria a tabela com o `CHECK` novo e copia as linhas.

## Chaves de deduplicacao em notice_log

| Aviso | kind | key |
| --- | --- | --- |
| Compromisso com data | `filhos` | `filho:{id}:{due_on}:{lead}` |
| Aniversario do filho | `filhos` | `filho-aniv:{child_id}:{ano}` |
| Lembrete de "a marcar" | `filhos` | `filho-amarcar:{semana ISO}` |

O registro e por pessoa (`phone` do membro), entao cada responsavel recebe uma vez.

## Remocao

- Remover filho: `DELETE` em `child_vaccines`, `child_events` e `children` na mesma transacao.
- `apagarFilhosDaConta(db, conta)`: o mesmo para a conta inteira. Hoje so a restauracao do `seed`
  usa; fica pronta para a exclusao de conta, que o produto ainda nao tem.
