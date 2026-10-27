# Contrato: ferramentas da agenda Google (US4)

Em `src/tools.ts`, comuns aos dois provedores (principio III). Chamadas ao Google em
`src/google.ts` (R39). Todas exigem a capacidade `agenda`.

## Ferramentas novas

| Ferramenta | Entrada | Saida |
| --- | --- | --- |
| `conectar_google_agenda` | nenhuma | link de uso unico valido por 15 min; se ja conectada, o e-mail ligado |
| `criar_compromisso` | `titulo`, `inicio` (`AAAA-MM-DDTHH:mm`), `duracao_minutos?` (padrao 60), `convidados?` (e-mails), `com_videochamada?`, `lembrar_minutos_antes?` (padrao 60, 0 = sem lembrete), `confirmar_conflito?` | criado: `Marcado: {titulo}, {dia} {hora} a {hora}{, link do Meet}{, convidados}. Lembro {n} min antes.`; conflito: `Conflito com {evento} ({horario}). Pergunte se cria assim mesmo.`; sem conexao: lembrete interno criado e o link para conectar |
| `consultar_agenda` | `data_inicio`, `data_fim`, `busca?` | eventos `id | dia hora-hora | titulo | convidados | link` em ordem, ou "nenhum compromisso" |
| `remarcar_compromisso` | `id`, `novo_inicio`, `duracao_minutos?` | antes e depois; convidados avisados pelo Google |
| `cancelar_compromisso` | `id`, `confirmado` | sem `confirmado`, pede confirmacao; com, apaga e cancela o lembrete ligado |
| `desconectar_google_agenda` | `confirmado` | sem `confirmado`, pede confirmacao; com, revoga e apaga o acesso |

Validacoes: `titulo` de 1 a 120 caracteres; `duracao_minutos` de 5 a 720; ate 20 convidados, cada
um um e-mail valido; `lembrar_minutos_antes` de 0 a 1440.

## Falhas

| Situacao | Resposta da ferramenta |
| --- | --- |
| Google sem configuracao no servidor | `A agenda do Google nao esta disponivel neste servidor. Criei o lembrete interno.` (ou so a primeira frase, nas consultas) |
| Conta nao conectada | `Google Agenda nao conectada. Link para conectar (15 min): {link}` |
| `invalid_grant` | conta vira `expirada`; `O acesso ao Google Agenda venceu. Link para reconectar: {link}`; em `criar_compromisso`, cria o lembrete interno |
| Erro de rede ou 5xx | `Nao consegui falar com o Google Agenda agora.`; em `criar_compromisso`, cria o lembrete interno |

## Prompt

Regras acrescentadas: compromisso com hora marcada vai para `criar_compromisso` (que tambem cria o
lembrete), lembrete solto continua em `criar_lembrete`; sem data ou hora, perguntar antes; com
conflito, perguntar; para mover ou cancelar, `consultar_agenda` primeiro e nunca inventar id.
