# Contrato: rotas do painel para filhos

Todas sob `/api`, com a sessao do painel (`Authorization: Bearer`). Todas exigem a capacidade
`agenda`; sem ela, `403 { "erro": "Seu acesso a esta conta nao inclui isso." }` (mesmo texto de
`SEM_ACESSO`). Entrada validada com zod, erro de validacao em `400 { "erro": "campo: motivo" }`.
Todas filtram pela conta de quem pergunta; id de outra conta devolve `404`.

Entradas em `CAPACIDADE_ROTA` de `src/api.ts`:

```text
"GET /api/filhos", "POST /api/filhos", "PATCH /api/filhos/:id", "DELETE /api/filhos/:id",
"GET /api/filhos/compromissos", "POST /api/filhos/compromissos",
"PATCH /api/filhos/compromissos/:id", "DELETE /api/filhos/compromissos/:id",
"GET /api/filhos/:id/vacinas", "POST /api/filhos/vacinas"  -> ["agenda"]
```

## Tipos

```ts
type TipoCompromisso = "escola" | "aniversario_amigo" | "vacina" | "consulta" | "outro";

interface Filho {
  id: number;
  nome: string;
  nascimento: string | null;        // YYYY-MM-DD
  idade: number | null;             // exata ou aproximada
  idadeAproximada: boolean;
  proximo: Compromisso | null;      // proximo item aberto, incluindo aniversario
}

interface Compromisso {
  id: number | null;                // null no aniversario do filho (virtual)
  virtual: boolean;
  filhoId: number;
  filhoNome: string;
  tipo: TipoCompromisso | "aniversario";
  titulo: string;
  disciplina: string | null;
  amigo: string | null;
  presente: string | null;
  presenteSituacao: "por_comprar" | "comprado" | null;
  local: string | null;
  observacao: string | null;
  data: string | null;              // null = a marcar
  hora: string | null;              // HH:MM
  antecedenciaDias: number | null;  // null = padrao do tipo
  repetirMeses: number | null;
  situacao: "aberto" | "concluido" | "cancelado";
  aMarcar: boolean;
}
```

## Filhos

### GET /api/filhos

Resposta `200`:

```json
{ "filhos": [Filho], "limite": 10 }
```

### POST /api/filhos

Corpo: `{ "nome": "Marina", "nascimento": "2018-03-12" }` ou `{ "nome": "Pedro", "idadeAproximada": 6 }`.
Um dos dois pode faltar, os dois juntos nao.

- `201` com o `Filho`.
- `409 { "erro": "Ja existe um filho com esse nome." }` ou `{ "erro": "Limite de 10 filhos por conta." }`.
- `400` para data futura, mais de 25 anos ou nome fora de 1 a 40 caracteres.

### PATCH /api/filhos/:id

Corpo parcial: `nome`, `nascimento`, `idadeAproximada`. `200` com o `Filho`. `409` para nome repetido.

### DELETE /api/filhos/:id

Apaga o filho, os compromissos e as vacinas dele. `200 { "ok": true, "compromissosApagados": 3 }`.

## Compromissos

### GET /api/filhos/compromissos

Consulta: `filho` (id), `tipo`, `de` e `ate` (datas), `situacao` (`aberto` padrao, `concluido`,
`cancelado`, `todos`). Sem `de` e `ate`, devolve de hoje a 30 dias, mais os "a marcar".

Resposta `200`:

```json
{
  "compromissos": [Compromisso],
  "aMarcar": [Compromisso],
  "semana": [Compromisso]
}
```

`compromissos` vem em ordem de data e inclui os aniversarios dos filhos. `semana` e a janela de 7
dias a partir de hoje, sempre sem filtro de tipo, para o painel mostrar a semana de todos.

### POST /api/filhos/compromissos

Corpo:

```json
{
  "filhoId": 1,
  "tipo": "aniversario_amigo",
  "titulo": "Aniversario do Joao",
  "data": "2026-11-21",
  "hora": "15:00",
  "local": "Buffet Alegria",
  "amigo": "Joao",
  "presente": "quebra-cabeca",
  "antecedenciaDias": 3,
  "repetirMeses": 12
}
```

Obrigatorios: `filhoId`, `tipo`, `titulo`. Omitir `data` cria "a marcar". `hora` exige `data`.
`disciplina` so em `escola`. `amigo` e `presente` so em `aniversario_amigo`. `repetirMeses` de 1 a
24 so em `consulta`; em `aniversario_amigo` e sempre 12.

- `201` com o `Compromisso`.
- `400` para data no passado em compromisso novo aberto: o corpo pode trazer
  `"situacao": "concluido"` para registrar algo que ja aconteceu (sem aviso).

### PATCH /api/filhos/compromissos/:id

Corpo parcial com os campos acima e uma `acao` opcional:
`concluir`, `cancelar`, `reabrir`, `presente_comprado`, `presente_por_comprar`.

- `200 { "compromisso": Compromisso, "proximo": Compromisso | null }`, sempre nessa forma.
- Concluir uma `consulta` com `repetirMeses` cria a seguinte e a devolve em `proximo`. Nos demais
  casos `proximo` e `null`.
- Concluir o aniversario de um amigo o leva para o ano seguinte: o `compromisso` volta `aberto`, com
  a data nova e o presente `por_comprar`.
- Mudar `data` ou `hora` refaz os avisos: a chave inclui a data, entao o aviso da data antiga nao sai.

### DELETE /api/filhos/compromissos/:id

`200 { "ok": true }`. Apaga de vez; para manter o historico, use `cancelar`.

## Vacinas

### GET /api/filhos/:id/vacinas

```json
{
  "vacinas": [
    { "id": 1, "vacina": "Gripe", "dose": "2a dose", "aplicadaEm": "2026-11-06", "proximoCompromissoId": 12 }
  ],
  "proximas": [Compromisso]
}
```

Em ordem decrescente de data aplicada. `proximas` sao os compromissos abertos do tipo `vacina` do
filho, em ordem de data.

### POST /api/filhos/vacinas

Corpo: `{ "filhoId": 1, "vacina": "Gripe", "dose": "2a dose", "data": "2026-11-06", "proximaEmMeses": 6 }`
ou `"proximaData": "2027-05-06"`. Os dois juntos sao recusados com `400`.

- `201 { "vacina": {...}, "proximo": Compromisso | null }`.
- `400` para `data` futura.
