# Contrato: API do Google Agenda (US4)

Mesmo padrao de [api-conta.md](api-conta.md). Capacidade `agenda` nas rotas privadas.

## Rotas privadas (sessao do painel)

| Rota | Resposta |
| --- | --- |
| `GET /api/google` | `{ configurado: boolean, conectada: boolean, status: "conectada" \| "expirada" \| null, email: string \| null, erro: string \| null }` |
| `POST /api/google/conectar` | `{ url }`: endereco do Google com `state` novo (R37) |
| `DELETE /api/google` | revoga no Google e apaga o acesso; `{ ok: true }` |
| `GET /api/agenda` (alterada) | ganha `google: { conectada, eventos: Evento[], erro: string \| null }` com os eventos do `dia` pedido |

`POST /api/google/conectar` responde `503` com `{ erro: "Google Agenda nao configurada neste servidor." }`
quando falta `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` ou `PAINEL_URL`.

## Rotas publicas (fora de `/api/auth`, sem sessao)

| Rota | Comportamento |
| --- | --- |
| `GET /api/google/conectar/:token` | link do WhatsApp: confere o token (uso unico, 15 min), cria o `state` e responde `302` para o Google; token invalido responde uma pagina HTML curta "Link vencido, peca outro ao assessor" |
| `GET /api/google/retorno?code&state` | confere o `state`, troca o `code`, guarda o token cifrado e responde HTML "Google Agenda conectada. Pode voltar para o WhatsApp."; `error=access_denied` ou `state` invalido respondem HTML explicando e sem gravar nada |

O `redirect_uri` registrado no Google Cloud e `<PAINEL_URL>/api/google/retorno`.

## Evento

```json
{
  "id": "abc123",
  "titulo": "Dentista",
  "inicio": "2026-11-12T15:00:00-03:00",
  "fim": "2026-11-12T16:00:00-03:00",
  "diaInteiro": false,
  "convidados": ["ana@exemplo.com"],
  "linkVideo": "https://meet.google.com/xxx-yyyy-zzz",
  "linkGoogle": "https://www.google.com/calendar/event?eid=..."
}
```
