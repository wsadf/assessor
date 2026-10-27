# Contrato: API do painel para documentos (US2)

Mesmo padrao de [api-conta.md](api-conta.md): JSON, zod, `{ "erro": "..." }`, Bearer obrigatorio.
Visibilidade conforme [research.md R18](research.md#r18-permissao); documento que a pessoa nao
pode ver responde `404`, nunca `403`, para nao confirmar que existe.

## GET /api/documentos

Capacidade: `documentos`. Query: `pasta?`, `busca?` (FTS, R16), `pagina?` (30 por pagina).

```json
{
  "pastas": [{ "id": "contratos", "nome": "Contratos", "qtd": 8, "bytes": 11534336 }],
  "documentos": [
    {
      "id": 42,
      "titulo": "Contrato de aluguel do apartamento",
      "descricao": "Contrato de locacao com a Imobiliaria Sol, assinado em 12/03/2026, 30 meses.",
      "pasta": "contratos",
      "tipo": "application/pdf",
      "tamanho": 812345,
      "dataDocumento": "2026-03-12",
      "enviadoPor": "Bia",
      "guardadoEm": "2026-10-27T14:20:00Z",
      "transacaoId": null
    }
  ],
  "uso": { "bytes": 22020096, "limite": 1073741824, "alerta": false },
  "total": 31
}
```

`alerta` e `true` a partir de 80% do limite.

## GET /api/documentos/:id/arquivo

Capacidade: `documentos`, ou o documento estar ligado a uma transacao visivel para o perfil.
Devolve o arquivo com `Content-Type` original e
`Content-Disposition: inline; filename*=UTF-8''<titulo>.<ext>`. `404` se nao existir ou nao for
visivel.

## PATCH /api/documentos/:id

Capacidade: `documentos`. Corpo (todos opcionais): `{ "titulo": "...", "pasta": "casa",
"descricao": "..." }`. Titulo de 1 a 120 caracteres; pasta da lista padrao. Atualiza a busca.

## DELETE /api/documentos/:id

Capacidade: `documentos`. Apaga arquivo e linha (R20). `{ "ok": true }`.

## Alteracoes em rotas existentes

| Rota | Mudanca |
| --- | --- |
| `GET /api/transacoes` | cada transacao ganha `comprovanteId: number \| null` quando houver documento guardado e visivel |
| `GET /api/me` | `conta.capacidades` passa a incluir `documentos` para titular e completo |

Capacidade por rota nova, acrescentada a `CAPACIDADE_ROTA`:

| Rota | Capacidade |
| --- | --- |
| `GET /api/documentos` | `documentos` |
| `PATCH /api/documentos/:id` | `documentos` |
| `DELETE /api/documentos/:id` | `documentos` |
| `GET /api/documentos/:id/arquivo` | qualquer perfil; a regra de visibilidade decide |
