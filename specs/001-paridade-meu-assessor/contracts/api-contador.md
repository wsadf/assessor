# Contrato: area do contador (US7)

Mesmo padrao das outras APIs: JSON, zod, `{ "erro": "..." }`.

## Lado do titular (sessao do painel, capacidade `acessos`)

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/conta/contador` | | `{ convites: ConviteContador[], contadores: Contador[] }` |
| `POST /api/conta/contador/convites` | `{ rotulo? }` | `201 { id, codigo, validoAte, mensagemWhatsapp }`; `409` com 3 pendentes |
| `DELETE /api/conta/contador/convites/:id` | | `{ ok: true }`; `404` se aceito, cancelado ou de outra conta |
| `DELETE /api/conta/contador/:id` | | revoga; `{ ok: true }`; `404` se ja revogado ou de outra conta |

```ts
interface ConviteContador { id: number; final: string; rotulo: string | null; estado: "pendente" | "aceito" | "cancelado" | "expirado"; validoAte: string }
interface Contador { id: number; nome: string | null; rotulo: string | null; desde: string; ultimoAcesso: string | null }
```

`mensagemWhatsapp`: `Use o codigo {codigo} em Criar conta (ou em Clientes, se ja tiver conta) no painel do Assessor para ver o dossie mensal de {titular}. Vale ate {data}.`

## Cadastro

`POST /api/auth/cadastro` aceita `convite` com `CONT-`: sem `plano`, o codigo e validado e fica
pendente ate a ativacao (`POST /api/auth/ativar`), que cria o vinculo. Codigo invalido ou vencido:
`400` com a mesma mensagem dos convites de membro.

`GET /api/me` ganha `clientes: { conta: string; nome: string | null }[]` (vinculos ativos).

## Lado do contador (sessao do painel, sem capacidade: vale o vinculo)

`:conta` e o telefone da conta do cliente. Toda rota confere `accountant_access` ativo entre a
sessao e `:conta`; sem vinculo, `403 { "erro": "Seu acesso a este cliente foi encerrado." }`.

| Rota | Resposta |
| --- | --- |
| `POST /api/contador/aceitar` `{ codigo }` | `{ conta, nome }`; `400` codigo invalido; `409` se ja e contador dessa conta ou e da propria conta |
| `GET /api/contador/clientes` | `{ clientes: { conta, nome, desde }[] }` |
| `GET /api/contador/:conta/meses` | `{ meses: string[] }` (`AAAA-MM`, do mais recente) |
| `GET /api/contador/:conta/mes/:mes` | `{ mes, receitas, despesas, lancamentos: Lancamento[], documentos: DocContador[] }` |
| `GET /api/contador/:conta/documentos/:id/arquivo` | o arquivo, so se estiver no dossie de algum mes |
| `GET /api/contador/:conta/mes/:mes/pacote` | `application/zip`, `content-disposition: attachment; filename="dossie-AAAA-MM.zip"` |

```ts
interface Lancamento { id: number; data: string; tipo: "despesa" | "receita"; valor: number; categoria: string; descricao: string; contraparte: string | null; pagamento: string | null; parcela: string | null; lancadoPor: string | null }
interface DocContador { id: number; titulo: string; pasta: string; data: string; tipo: string; tamanho: number; lancamentoId: number | null }
```

Nenhuma rota do contador aceita `POST`, `PATCH` ou `DELETE` sobre dados do cliente.

## Pacote

```text
dossie-2026-10.zip
├── lancamentos-2026-10.csv     # data;tipo;valor;categoria;descricao;contraparte;pagamento;parcela;lancado_por
├── notas_fiscais/...
├── comprovantes/...
├── boletos/...
├── outros-comprovantes/...     # documentos de outras pastas ligados a um lancamento
└── LEIA-ME.txt                 # so quando algo ficou de fora pelo limite de 200 MB
```
