# Contrato: contador pelo WhatsApp (US7)

Ferramentas sincronas em `src/tools.ts`, capacidade `acessos` (so o titular). O contador nunca usa
o WhatsApp do assessor pela conta do cliente.

| Ferramenta | Entrada | Saida |
| --- | --- | --- |
| `convidar_contador` (nova) | `rotulo?` (ate 40) | codigo `CONT-`, validade e o texto pronto para encaminhar (`mensagemWhatsapp` de [api-contador.md](api-contador.md)) |
| `listar_acessos` (muda) | | acrescenta `Contador: {nome} ({rotulo}), desde {data}, ultimo acesso {data ou nunca}` |
| `remover_acesso` (muda) | `pessoa`, `confirmado` | acha tambem contador pelo nome, rotulo ou final do telefone; com `confirmado`, revoga |

## Prompt

"Gera um convite para o meu contador": `convidar_contador` e entregar o texto pronto. "Tira o
acesso do contador": `remover_acesso` confirmando antes.
