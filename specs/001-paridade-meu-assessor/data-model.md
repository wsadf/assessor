# Data Model: Paridade com o Meu Assessor

Decisoes em [research.md](research.md). Tudo em SQLite, criado ou migrado em `openDb` e
`prepararTabelas`, no mesmo estilo de `ALTER TABLE ... ADD COLUMN` ja usado. Uma secao por
historia.

# US1: Conta compartilhada

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

# US2: Documentos

## documents (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | telefone da conta (mesmo sentido de `transactions.phone`) |
| created_by | TEXT NOT NULL | telefone de quem enviou |
| status | TEXT NOT NULL | `pendente` ou `guardado` |
| folder | TEXT | uma das pastas padrao (R14); nulo enquanto pendente |
| title | TEXT | ate 120 caracteres; nulo enquanto pendente |
| description | TEXT | ate 600 caracteres, escrita pelo modelo ou pelo usuario |
| original_name | TEXT | nome do arquivo no WhatsApp; fotos recebem `foto-AAAAMMDD-HHMM.jpg` |
| mime_type | TEXT NOT NULL | ex.: `application/pdf`, `image/jpeg` |
| size_bytes | INTEGER NOT NULL | de 1 a 20 MB (20971520) |
| storage_path | TEXT NOT NULL UNIQUE | relativo a pasta de arquivos (R11) |
| document_date | TEXT | data do proprio documento, `AAAA-MM-DD`, se o modelo identificar |
| transaction_id | INTEGER | lancamento ligado (R15); nulo se nao houver |
| created_at | TEXT NOT NULL | chegada pelo WhatsApp |
| saved_at | TEXT | quando virou guardado |

Indices: `(phone, status, folder)`, `(phone, transaction_id)`, `(created_by, status, created_at)`.

Transicoes:

```text
recebido --(arquivo salvo no disco)--> pendente
pendente --guardar_documento / lancamento com foto--> guardado
pendente --24 h sem guardar--> apagado (arquivo e linha)
guardado --excluir--> apagado (arquivo e linha)
```

Regras:

- Pendente so e visivel para `created_by`; o "ultimo pendente" e o mais recente dele.
- A soma de `size_bytes` dos guardados da conta nao passa de 1 GB (1073741824); a partir de 80%
  as respostas de guardar avisam.
- Excluir uma transacao nao apaga o documento: `transaction_id` continua apontando para um
  lancamento que o repo ja nao devolve, e a busca o trata como sem ligacao.

## documents_fts (nova, virtual)

`CREATE VIRTUAL TABLE documents_fts USING fts5(title, description, original_name, folder,
content='documents', content_rowid='id', tokenize='unicode61 remove_diacritics 2')`, mantida por
gatilhos de insert, update e delete em `documents`. So entram linhas com `status = 'guardado'`
na busca (filtro na consulta).

## Capacidade nova

`documentos`: titular e acesso completo. Regras de visibilidade em
[research.md R18](research.md#r18-permissao).

# US3: Avisos proativos

Decisoes em [research.md](research.md) R23 a R34.

## bills (nova): conta a pagar

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | telefone da conta |
| created_by | TEXT NOT NULL | quem cadastrou |
| description | TEXT NOT NULL | 1 a 80 caracteres, ex.: "Condominio", "Fatura Nubank" |
| amount_cents | INTEGER | valor previsto, > 0; nulo quando varia (fatura) |
| category | TEXT NOT NULL | categoria da despesa ao pagar; padrao "Contas" |
| due_on | TEXT NOT NULL | proximo vencimento, `AAAA-MM-DD` |
| due_day | INTEGER | dia do vencimento (1 a 31) para recorrencia mensal; nulo se unica |
| status | TEXT NOT NULL | `aberta`, `paga`, `cancelada` |
| paid_transaction_id | INTEGER | ultima despesa gerada ao pagar |
| created_at | TEXT NOT NULL | |

Transicoes:

```text
aberta --pagar (unica)--> paga
aberta --pagar (mensal)--> aberta, com due_on no proximo mes (due_day; 31 vira o ultimo dia)
aberta --cancelar--> cancelada
```

## recurring (nova): lancamento recorrente

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | telefone da conta |
| created_by | TEXT NOT NULL | |
| kind | TEXT NOT NULL | `despesa` ou `receita` |
| amount_cents | INTEGER NOT NULL | > 0 |
| category | TEXT NOT NULL | |
| description | TEXT NOT NULL | 1 a 80 caracteres |
| counterpart | TEXT | |
| payment_method | TEXT | |
| frequency | TEXT NOT NULL | `diaria`, `semanal`, `mensal` |
| anchor_day | INTEGER | semanal: 0 (domingo) a 6; mensal: 1 a 31; diaria: nulo |
| next_on | TEXT NOT NULL | proxima data de lancamento, `AAAA-MM-DD` |
| status | TEXT NOT NULL | `ativa`, `pausada`, `cancelada` |
| created_at | TEXT NOT NULL | |

Transicoes: `ativa <-> pausada` (retomar recalcula `next_on` a partir de hoje), `ativa|pausada ->
cancelada` (final). Lancamentos ja feitos continuam.

## Colunas novas

| Tabela | Coluna | Regra |
| --- | --- | --- |
| transactions | recurring_id INTEGER | recorrencia que gerou; indice unico parcial `(recurring_id, occurred_on) WHERE recurring_id IS NOT NULL` |
| transactions | bill_id INTEGER | conta a pagar quitada por esta despesa |

## notice_prefs (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| phone | TEXT NOT NULL | quem recebe (membro) |
| kind | TEXT NOT NULL | `vencimentos`, `categoria`, `recorrentes`, `resumo_manha`, `resumo_noite` |
| enabled | INTEGER NOT NULL | 0 ou 1 |
| hour | INTEGER NOT NULL | 0 a 23 |

Chave primaria `(phone, kind)`. Sem linha, vale o padrao de R28 (horas padrao: vencimentos,
categoria e recorrentes 9h; resumo da manha `DAILY_SUMMARY_HOUR`; resumo da noite 21h). A
coluna `users.last_summary_on` deixa de ser usada pelo resumo da manha, que passa ao `notice_log`.

## notice_log (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| phone | TEXT NOT NULL | quem recebeu |
| kind | TEXT NOT NULL | tipo do aviso |
| key | TEXT NOT NULL | chave de R30 |
| sent_at | TEXT NOT NULL | |

Chave primaria `(phone, kind, key)`. Linhas com mais de 90 dias sao apagadas pelo agendador.

## pending_notices (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL | quem deveria receber |
| text | TEXT NOT NULL | texto pronto do aviso ou lembrete |
| created_at | TEXT NOT NULL | descartado depois de 7 dias |
| delivered_at | TEXT | preenchido quando sai na proxima conversa |

# US4: Google Agenda

Decisoes em [research.md](research.md) R35 a R46.

## google_accounts (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| phone | TEXT PK | telefone da pessoa (membro), nao da conta (R35) |
| email | TEXT | e-mail da conta Google, so para exibir |
| refresh_token_enc | TEXT NOT NULL | `iv.tag.cifrado` em base64url, AES-256-GCM com `GOOGLE_TOKEN_KEY` (R38) |
| scope | TEXT NOT NULL | escopos concedidos, para conferir que `calendar.events` veio |
| status | TEXT NOT NULL | `conectada` ou `expirada` |
| connected_at | TEXT NOT NULL | |
| last_error | TEXT | ultima falha do Google, para o painel |

Transicoes:

```text
(sem linha) --retorno do OAuth--> conectada
conectada --invalid_grant--> expirada
expirada --novo retorno do OAuth--> conectada
conectada|expirada --desconectar--> (linha apagada, token revogado no Google)
```

## google_auth (nova)

Guarda os segredos de uso unico do fluxo de conexao.

| Campo | Tipo | Regra |
| --- | --- | --- |
| token_hash | TEXT PK | SHA-256 do `state` ou do token do link |
| kind | TEXT NOT NULL | `state` (10 min) ou `link` (15 min, enviado pelo WhatsApp) |
| phone | TEXT NOT NULL | quem vai conectar |
| expires_at | TEXT NOT NULL | |
| used_at | TEXT | preenchido no primeiro uso; segundo uso e recusado |

Linhas vencidas ha mais de 1 dia sao apagadas pela limpeza do agendador.

## Coluna nova

| Tabela | Coluna | Regra |
| --- | --- | --- |
| reminders | google_event_id TEXT | evento do Google que este lembrete acompanha; remarcar move o lembrete e cancelar o cancela |

## Evento (so em memoria, vindo do Google)

`{ id, titulo, inicio, fim, diaInteiro, convidados: string[], linkVideo, linkGoogle }`. O produto nao
guarda copia dos eventos: le do Google quando precisa (principio V: o calendario da pessoa e a
fonte).

# US5: Pagina publica de agendamento

Decisoes em [research.md](research.md) R47 a R58.

## booking_pages (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| phone | TEXT NOT NULL UNIQUE | quem atende (membro); uma pagina por pessoa |
| conta | TEXT NOT NULL | telefone da conta, para lembretes e avisos |
| slug | TEXT NOT NULL UNIQUE | 10 caracteres `[a-z0-9]`, aleatorio (R48) |
| display_name | TEXT NOT NULL | 2 a 60 caracteres, o nome que o cliente ve |
| durations | TEXT NOT NULL | JSON com 1 a 6 valores de `15, 30, 45, 60, 90, 120` |
| weekdays | TEXT NOT NULL | JSON com 1 a 7 dias, 0 (domingo) a 6 |
| window_start | TEXT NOT NULL | `HH:mm` |
| window_end | TEXT NOT NULL | `HH:mm`, maior que `window_start` |
| min_notice_hours | INTEGER NOT NULL | 0 a 168, padrao 12 |
| horizon_days | INTEGER NOT NULL | 1 a 90, padrao 30 |
| status | TEXT NOT NULL | `ativa` ou `pausada` |
| created_at | TEXT NOT NULL | |

## bookings (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | INTEGER PK | |
| page_id | INTEGER NOT NULL | pagina |
| owner_phone | TEXT NOT NULL | quem atende |
| client_name | TEXT NOT NULL | 2 a 80 caracteres |
| client_email | TEXT NOT NULL | e-mail valido |
| client_phone | TEXT NOT NULL | so digitos, 10 a 15 |
| client_tz | TEXT | fuso do navegador do cliente (IANA), se for diferente de `TIMEZONE` |
| starts_at | TEXT NOT NULL | ISO UTC |
| ends_at | TEXT NOT NULL | ISO UTC |
| status | TEXT NOT NULL | `reservando`, `agendado`, `confirmado`, `remarcando`, `cancelado` |
| google_event_id | TEXT | evento criado no calendario de quem atende |
| reschedule_options | TEXT | JSON com ate 3 `{ inicio, fim }` enquanto `remarcando` |
| confirmation_sent_at | TEXT | quando a confirmacao da vespera saiu |
| confirmation_failed | INTEGER NOT NULL | 0 ou 1 (sem modelo aprovado ou recusa da Meta) |
| client_ip_hash | TEXT | SHA-256 do IP, so para o limite de reservas |
| created_at | TEXT NOT NULL | |

Indices: `(page_id, status, starts_at)`, `(client_phone, status, starts_at)`.

Transicoes:

```text
(nova) --reserva--> reservando --Google criou--> agendado
reservando --Google recusou, horario ocupado ou 2 min--> (apagada)
agendado --cliente responde 1--> confirmado
agendado|confirmado --dono pede remarcar--> remarcando (opcoes enviadas)
remarcando --cliente escolhe opcao--> agendado (novo horario)
remarcando --cliente responde 0--> agendado (dono avisado para combinar)
qualquer --dono cancela--> cancelado (evento apagado)
```

Dados do cliente sao apagados 90 dias depois de `ends_at` (a linha fica sem nome, e-mail e
telefone).

## client_optouts (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| client_phone | TEXT PK | quem respondeu PARAR |
| created_at | TEXT NOT NULL | |

Numero aqui nao recebe mais mensagem de nenhuma pagina; a reserva continua possivel, sem
confirmacao por WhatsApp.

## Aviso novo

`notice_prefs.kind` ganha `agendamentos` (R57), ligado por padrao para quem tem pagina `ativa`.
