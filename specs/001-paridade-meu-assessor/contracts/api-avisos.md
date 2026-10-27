# Contrato: API do painel para a US3

Mesmo padrao de [api-conta.md](api-conta.md). Valores em reais com duas casas, datas
`AAAA-MM-DD`.

## Contas a pagar (capacidade `despesas`)

| Rota | Corpo ou query | Resposta |
| --- | --- | --- |
| `GET /api/contas-pagar` | `incluirPagas?` | `{ contas: [{ id, descricao, valor \| null, categoria, vencimento, mensal, situacao, vencida, ultimaTransacaoId }] }` |
| `POST /api/contas-pagar` | `{ descricao (1 a 80), vencimento, valor?, categoria?, mensal }` | `201` com a conta |
| `PATCH /api/contas-pagar/:id` | campos do POST, opcionais | conta |
| `POST /api/contas-pagar/:id/pagar` | `{ valor?, data?, pagamento? }` | `{ conta, transacao }`; `400` sem valor cadastrado nem informado |
| `DELETE /api/contas-pagar/:id` | | cancela; `{ ok: true }` |

## Recorrencias (`despesas` ou `receitas`, conforme o tipo)

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/recorrencias` | | `{ recorrencias: [{ id, tipo, valor, categoria, descricao, contraparte, pagamento, frequencia, proxima, situacao }] }`, so os tipos visiveis |
| `POST /api/recorrencias` | `{ tipo, valor, categoria, descricao (1 a 80), frequencia, inicio, contraparte?, pagamento? }` | `201`; `403` para tipo fora do perfil |
| `PATCH /api/recorrencias/:id` | `{ acao?: "pausar" \| "retomar" \| "cancelar", valor? }` | recorrencia |

## Avisos (qualquer perfil, sempre de quem esta logado)

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/avisos` | | `{ avisos: [{ tipo, nome, descricao, ligado, hora, disponivel }], modeloAprovado: boolean }` |
| `PUT /api/avisos/:tipo` | `{ ligado: boolean, hora?: 0..23 }` | aviso atualizado; `400` para tipo invalido |

`disponivel` e falso quando o perfil nao tem a area (ex.: `categoria` para agenda e tarefas).
`modeloAprovado` indica se `WHATSAPP_NOTICE_TEMPLATE` esta configurado; sem ele, a tela avisa que
os avisos so chegam se a pessoa conversou nas ultimas 24 horas (principio VII).

## Alteracoes

| Rota | Mudanca |
| --- | --- |
| `GET /api/transacoes` | cada transacao ganha `recorrente: boolean` e `contaPagarId` |
| `GET /api/financas` | `contasProximas`: ate 5 contas abertas que vencem nos proximos 7 dias |

Entradas novas em `CAPACIDADE_ROTA`: contas a pagar com `["despesas"]`; recorrencias com
`["despesas", "receitas"]` (o tipo e conferido na rota); avisos sem restricao.
