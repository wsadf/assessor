# Contrato: mensagens a outras pessoas no painel (US6)

Mesmo padrao das outras APIs: JSON, zod, `{ "erro": "..." }`. Todas exigem a capacidade `agenda`
(`CAPACIDADE_ROTA`) e operam sobre `ctx.conta`.

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/contatos/mensagens` | | `{ envios: Envio[], mensagens: Mensagem[] }` |
| `DELETE /api/contatos/envios/:id` | | `{ ok: true }`; `404` se nao for da conta ou ja encerrado |

```ts
interface Envio {
  id: number;
  contato: string;
  texto: string;
  proximo: string | null; // ISO UTC
  recorrencia: "diario" | "semanal" | "mensal" | null;
  pedidoPor: string | null; // nome de quem pediu
}

interface Mensagem {
  id: number;
  contato: string;
  enviadaEm: string;
  situacao: "enviada" | "entregue" | "lida" | "falhou" | "pulada";
  erro: string | null;
  resposta: string | null;
  respondidaEm: string | null;
}
```

`mensagens` traz as ultimas 30 da conta. O telefone do contato nao vai para o painel: o nome basta.
