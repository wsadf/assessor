# Contrato: cobranca por Pix (US9)

Mesmo padrao das outras APIs: JSON, zod, `{ "erro": "..." }`.

## Privadas (sessao do painel, capacidade `receitas`)

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/cobrancas` | `?situacao` | `{ chave: ChavePix \| null, cobrancas: Cobranca[] }` |
| `PUT /api/cobrancas/chave` | `{ tipo, chave, nome, cidade }` | `ChavePix`; `400` com o motivo (digito, formato, tamanho) |
| `POST /api/cobrancas` | `{ pagador, whatsapp?, descricao, valor, vencimento? }` | `201 Cobranca`; `409` sem chave cadastrada |
| `POST /api/cobrancas/:id/recebida` | `{ data? }` | `Cobranca` paga com a receita lancada; `409` se ja paga ou cancelada |
| `DELETE /api/cobrancas/:id` | | `Cobranca` cancelada; `409` se ja paga |

```ts
interface ChavePix { tipo: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria"; chave: string; nome: string; cidade: string }

interface Cobranca {
  id: number;
  pagador: string;
  whatsapp: string | null;
  descricao: string;
  valor: number;
  vencimento: string | null;
  situacao: "aberta" | "paga" | "cancelada";
  vencida: boolean;
  link: string;          // PAINEL_URL/pagar/<slug>
  copiaECola: string;
  pagaEm: string | null;
  pagaPor: "usuario" | "extrato" | null;
  transacaoId: number | null;
}
```

## Publica (sem sessao)

`GET /api/pagar/:slug`

```json
{ "recebedor": "WESLEY FARIA", "descricao": "Consultoria de agosto", "valor": 850, "vencimento": "2026-11-05", "situacao": "aberta", "copiaECola": "000201..." }
```

`404 { "erro": "Cobrança não encontrada." }` para `slug` inexistente. Cobranca paga ou cancelada
devolve so `recebedor`, `descricao` e `situacao`. Nunca devolve telefone, e-mail ou outros dados da
conta.

A pagina do painel `/pagar/:slug` (rota publica) mostra o QR do `copiaECola` e o aviso de que o
pagamento vai direto para o recebedor pelo Pix.
