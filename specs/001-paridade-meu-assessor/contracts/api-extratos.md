# Contrato: extrato bancario (US8)

Mesmo padrao das outras APIs: JSON, zod, `{ "erro": "..." }`. Todas exigem `despesas` e
`receitas` (as duas) e operam em `ctx.conta`.

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/extratos` | | `{ contas: ContaBancaria[], importacoes: Importacao[] }` (ultimas 20) |
| `POST /api/extratos` | `{ nome: string, conteudo: string }` (base64, ate 5 MB; limite do corpo da rota: 8 MB) | `201 Resultado`; `400` arquivo que nao e OFX ou sem movimentacao |
| `PATCH /api/extratos/contas/:id` | `{ nome?, fechamento?, vencimento? }` (dias 1 a 31, so cartao) | `ContaBancaria`; `404` de outra conta |
| `DELETE /api/extratos/contas/:id` | | `{ ok: true }`; desliga a conta: os lancamentos ficam, sem a ligacao |

```ts
interface ContaBancaria {
  id: number;
  tipo: "corrente" | "cartao";
  nome: string;
  banco: string | null;
  final: string | null;
  saldo: number | null;
  saldoEm: string | null;
  fechamento: number | null;
  vencimento: number | null;
  ultimaImportacao: string | null;
}

interface Importacao {
  id: number;
  conta: string; // nome da conta bancaria
  arquivo: string | null;
  de: string | null;
  ate: string | null;
  criados: number;
  unidos: number;
  ignorados: number;
  estornados: number;
  em: string;
}

interface Resultado extends Importacao {
  contaBancaria: ContaBancaria;
}
```

`GET /api/transacoes` passa a trazer `origem: "extrato" | null` em cada transacao. Estornadas nao
aparecem nem entram em total de nenhuma rota (mesmo filtro dos excluidos).
