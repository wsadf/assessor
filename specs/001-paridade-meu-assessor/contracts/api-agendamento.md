# Contrato: pagina publica de agendamento (US5)

Mesmo padrao das outras APIs: JSON, zod, `{ "erro": "..." }`. Horarios sempre em ISO UTC.

## Publicas (sem sessao, plugin proprio com prefixo `/api/agendar`)

### GET /api/agendar/:slug

```json
{
  "nome": "Julia Andrade",
  "duracoes": [30, 60],
  "dias": ["2026-11-02", "2026-11-03"],
  "fusoDoProfissional": "America/Sao_Paulo"
}
```

`dias` lista as datas do horizonte que caem nos dias de atendimento. `404` com
`{ "erro": "Pagina de agendamento nao encontrada." }` para `slug` inexistente, pagina pausada ou
dono sem Google conectado. Nunca devolve telefone, e-mail ou compromissos de quem atende.

### GET /api/agendar/:slug/horarios?dia=AAAA-MM-DD&duracao=30

```json
{ "horarios": [{ "inicio": "2026-11-03T22:00:00.000Z", "fim": "2026-11-03T22:30:00.000Z" }] }
```

So inicios livres (R50). `400` para duracao fora da pagina ou dia fora do horizonte; `503` com
`{ "erro": "Nao consegui ver a agenda agora. Tente em alguns minutos." }` quando o Google falha.

### POST /api/agendar/:slug

```json
{
  "inicio": "2026-11-03T22:00:00.000Z",
  "duracao": 30,
  "nome": "Camila Prado",
  "email": "camila.prado@email.com",
  "whatsapp": "11912345678",
  "aceite": true,
  "fuso": "America/Sao_Paulo",
  "site": ""
}
```

`fuso` e o do navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`), validado com
`Intl.supportedValuesOf("timeZone")`; serve para as mensagens ao cliente indicarem o fuso.

`site` e o campo escondido: preenchido, a resposta e `201` falsa e nada e gravado. `aceite` precisa
ser `true`. `whatsapp` recebe o DDI 55 quando vier com 10 ou 11 digitos.

| Resposta | Quando |
| --- | --- |
| `201 { "inicio", "fim", "nome": "Julia Andrade" }` | reservado |
| `409 { "erro": "Esse horario acabou de ser ocupado. Escolha outro." }` | sobreposicao (R52) |
| `429 { "erro": "Muitos agendamentos seguidos. Tente mais tarde." }` | limite de R53 |
| `400` | validacao |

## Privadas (sessao do painel, capacidade `agenda`)

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /api/agendamento/pagina` | | `{ pagina: Pagina \| null, link: string \| null, googleConectado, podeAtivar }` |
| `PUT /api/agendamento/pagina` | `{ nome, duracoes, dias, inicio, fim, antecedenciaHoras, horizonteDias, ativa }` | pagina; `409` sem Google conectado |
| `POST /api/agendamento/pagina/novo-link` | | pagina com `slug` novo |
| `GET /api/agendamento` | `?de&ate` | `{ agendamentos: [{ id, cliente, email, whatsapp, inicio, fim, situacao, confirmacaoFalhou }] }` |
| `POST /api/agendamento/:id/remarcar` | | agendamento em `remarcando` com as opcoes enviadas |
| `DELETE /api/agendamento/:id` | | cancela, apaga o evento e avisa o cliente (se nao pediu PARAR) |

Todas operam sobre a pagina de `ctx.membro`.
