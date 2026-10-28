# Contrato: bancos conectados (US8)

Mesmo padrao das outras APIs: JSON, zod, `{ "erro": "..." }`. Sem `PLUGGY_CLIENT_ID` e
`PLUGGY_CLIENT_SECRET`, as rotas privadas respondem `503 { "erro": "A conexão com bancos não está disponível neste servidor." }`.

## Privadas (sessao do painel)

| Rota | Capacidade | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /api/bancos` | `despesas` ou `receitas` | | `{ disponivel, conexoes: Conexao[] }` |
| `POST /api/bancos/connect-token` | `acessos` | `{ conexaoId? }` (renovar) | `{ accessToken }` para abrir o widget |
| `POST /api/bancos` | `acessos` | `{ itemId }` | `201` conexao; `403` se o item for de outro `clientUserId`; `409` se ja conectado |
| `POST /api/bancos/:id/sincronizar` | `acessos` | | `{ importadas, unidas, estornadas }` |
| `DELETE /api/bancos/:id` | `acessos` | | apaga no parceiro e aqui; os lancamentos ficam |

```ts
interface Conexao {
  id: number;
  banco: string;
  situacao: "ativa" | "atualizando" | "erro" | "expirada" | "revogada";
  detalhe: string | null;
  consentimentoAte: string | null;
  ultimaSincronizacao: string | null;
  contas: {
    id: number;
    tipo: "corrente" | "cartao";
    nome: string;
    final: string | null;
    saldo: number | null;
    limite: number | null;
    disponivel: number | null;
    fechamento: string | null;
    vencimento: string | null;
  }[];
}
```

`GET /api/transacoes` passa a trazer `origem: "banco" | null` e `estornada: boolean` em cada
transacao; estornadas nao entram nos totais de nenhuma rota.

## Publica (sem sessao)

`POST /api/openfinance/webhook/:segredo`

- `:segredo` diferente de `OPENFINANCE_WEBHOOK_SECRET`: `404`, sem corpo.
- Corpo `{ event, itemId }`: se o `itemId` for de uma conexao conhecida, agenda a sincronizacao
  dela e responde `202` na hora; desconhecido, `202` sem fazer nada. Nenhum dado do corpo vira
  lancamento.

## Chamadas ao parceiro (so leitura)

`POST /auth`, `POST /connect_token`, `GET /items/:id`, `DELETE /items/:id`, `GET /accounts?itemId`,
`GET /transactions?accountId&from&to&page`, `GET /bills?accountId`. Nenhuma outra.
