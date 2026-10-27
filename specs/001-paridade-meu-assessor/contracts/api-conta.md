# Contrato: API do painel para a conta compartilhada (US1)

Mesmo padrao de `src/api.ts`: JSON, validacao com zod, erro como `{ "erro": "mensagem" }`.
Rotas privadas exigem `Authorization: Bearer <token>`.

## Rotas publicas (`/api/auth`)

### POST /api/auth/convite

Valida um codigo antes do cadastro. Conta como tentativa no limite de R6 quando invalido.

```json
// pedido
{ "codigo": "CONV-7QF3ZD", "telefone": "5511912345678" }
// 200
{ "titular": "Wesley", "perfil": "so_gastos", "temDadosProprios": false }
```

Erros: `400` codigo invalido, expirado, cancelado ou ja usado (mesma mensagem para todos);
`409` numero ja e titular de uma conta com membros ativos; `429` tentativas esgotadas.

### POST /api/auth/cadastro (alterada)

Aceita `convite` opcional. Com convite, `plano` deixa de ser obrigatorio. O vinculo so e criado
em `POST /api/auth/ativar`, depois que o numero e comprovado.

```json
{ "nome": "Bia", "telefone": "5511912345678", "email": "bia@exemplo.com", "senha": "********", "convite": "CONV-7QF3ZD" }
```

### POST /api/auth/ativar (alterada)

Se o cadastro tinha convite valido, cria ou reativa o vinculo em `account_members`, marca o
convite como aceito e devolve a sessao. A resposta ganha `conta`:

```json
{ "token": "...", "conta": { "nome": "Bia", "titular": "Wesley", "perfil": "so_gastos" } }
```

Se o convite expirou entre o cadastro e a ativacao, a conta e ativada sem vinculo e a resposta
traz `"aviso": "O convite expirou. Peca um novo ao titular."`.

## Rotas privadas

### GET /api/me (alterada)

Passa a incluir `conta: { titular, perfil, capacidades: string[] }`. O painel usa isso para
esconder mesas e telas; o servidor continua recusando por conta propria.

### GET /api/conta/acessos

Capacidade: qualquer perfil (cada um ve a lista; so o titular ve convites).

```json
{
  "titular": { "nome": "Wesley", "telefone": "+55 ••••• 1111" },
  "membros": [
    { "telefone": "5511912345678", "telefoneMascarado": "+55 ••••• 5678", "nome": "Bia", "perfil": "so_gastos", "desde": "2026-10-27" }
  ]
}
```

### GET /api/conta/convites

Capacidade: `acessos`. Lista convites pendentes, aceitos e expirados dos ultimos 30 dias, com
`final` (dois ultimos caracteres), `perfil`, `rotulo`, `estado`, `validoAte`.

### POST /api/conta/convites

Capacidade: `acessos`. Limite: 10 convites pendentes por conta.

```json
// pedido
{ "perfil": "so_gastos", "rotulo": "Socio" }
// 201: unica vez em que o codigo aparece em claro
{ "id": 12, "codigo": "CONV-7QF3ZD", "validoAte": "2026-11-03", "mensagemWhatsapp": "Use o codigo CONV-7QF3ZD ..." }
```

### DELETE /api/conta/convites/:id

Capacidade: `acessos`. Cancela um convite pendente. `404` se nao for da conta ou nao estiver
pendente.

### PATCH /api/conta/membros/:telefone

Capacidade: `acessos`. Corpo `{ "perfil": "completo" }`. Vale na proxima mensagem ou requisicao.

### DELETE /api/conta/membros/:telefone

Capacidade: `acessos`. Marca `removed_at` e apaga as sessoes do membro. `400` para o titular.

## Capacidade por rota existente

O hook de rota passa a conferir a capacidade. Recusa com `403` e
`{ "erro": "Seu acesso a esta conta nao inclui isso." }`.

| Rotas | Capacidade |
| --- | --- |
| `GET /financas`, `/transacoes`, `/categorias`, `/contrapartes`, `/pagamentos`, `/analises`, `/meses` | `despesas`; sem `receitas`, a resposta omite receitas, saldo, renda e projecao |
| `POST/PATCH/DELETE /transacoes` | `despesas` para despesa, `receitas` para receita |
| `GET /fiscal` | `receitas` |
| `GET /agenda`, `POST/DELETE /lembretes` | `agenda` |
| `GET/POST/PATCH/DELETE /tarefas` | `tarefas` |
| `GET /operacao` | qualquer perfil, contagens filtradas pelas capacidades |
| `GET /pesquisas` | `agenda` ou `tarefas` |

A sessao do `PAINEL_TOKEN` de servico continua com perfil `titular` de `PAINEL_TELEFONE`.
