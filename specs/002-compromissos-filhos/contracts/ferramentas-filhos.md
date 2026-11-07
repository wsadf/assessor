# Contrato: ferramentas do assistente para filhos

Definidas em `src/tools.ts` (esquema zod, entrada em `CAPACIDADE` com `agenda`, declaracao em
`tool(...)` e `case` em `executeTool`). Funcionam igual com Gemini e com Claude (principio III).
Texto de resposta em portugues, curto, sem travessao. Datas em `YYYY-MM-DD` resolvidas a partir do
`[Agora: ...]` da mensagem. Erro de permissao sai como o texto "Sem permissao: ..." que o prompt ja
sabe explicar.

Resolucao do filho (R9): `filho` e o nome dito pelo usuario. Com um filho so, pode ir `null`. Se nao
resolver, a ferramenta devolve, sem gravar nada, um texto que orienta a perguntar:

- ambiguo: `Mais de um filho combina com "{nome}": {lista}. Pergunte de qual e chame de novo.`
- nenhum: `Nao achei filho chamado "{nome}". Filhos cadastrados: {lista}. Pergunte ou cadastre.`

## cadastrar_filho

| Campo | Tipo | Regra |
| --- | --- | --- |
| nome | string 1 a 40 | |
| nascimento | data ou null | |
| idade_aproximada | inteiro 0 a 25 ou null | so quando nao ha data |

Resposta: `Filho cadastrado: #3 Marina, 8 anos.` Sem data de nascimento acrescenta: `Sem a data de
nascimento nao aviso o aniversario de Marina.` Nome repetido ou limite: texto de erro sem gravar.
O nome do filho vai entre parenteses nas confirmacoes, para nao depender de adivinhar o genero.

## listar_filhos

Sem entrada. Resposta: uma linha por filho (`#id Nome, idade, proximo compromisso`) ou `Nenhum
filho cadastrado.`

## remover_filho

| Campo | Tipo | Regra |
| --- | --- | --- |
| filho | string | |
| confirmado | boolean | |

Com `confirmado` falso: `Confirme com o usuario antes de remover {nome}: apago tambem {n}
compromissos e {m} vacinas. Nao tem volta.` Com verdadeiro, apaga e confirma.

## registrar_compromisso_filho

| Campo | Tipo | Regra |
| --- | --- | --- |
| filho | string ou null | |
| tipo | enum | `escola`, `aniversario_amigo`, `vacina`, `consulta`, `outro` |
| titulo | string 1 a 80 | ex.: "Prova de ciencias", "Dentista" |
| data | data ou null | null grava "a marcar" |
| hora | `HH:MM` ou null | |
| local | string ou null | |
| observacao | string ou null | |
| disciplina | string ou null | so `escola` |
| amigo | string ou null | so `aniversario_amigo` |
| presente | string ou null | so `aniversario_amigo` |
| avisar_dias_antes | inteiro 0 a 60 ou null | null usa o padrao do tipo |
| repetir_meses | inteiro 1 a 24 ou null | so `consulta` |

Resposta: `Registrado: #12 Prova de ciencias (Marina), sexta 13/11 as 08:00. Aviso na vespera.` Para
aniversario: `... Presente: quebra-cabeca (por comprar). Aviso 3 dias antes e na vespera.` Sem data:
`Registrado como a marcar: #13 Pediatra (Pedro). Te lembro toda semana ate marcar.` Data no passado
sem confirmacao do usuario: `A data ja passou. Pergunte se e um registro do que ja aconteceu; se for,
chame de novo com ja_aconteceu true.` Com `ja_aconteceu` (boolean opcional), grava como concluido sem
aviso: `Registrado como ja aconteceu: #14 Oculista (Pedro), quarta 12/11. Sem aviso.`

## consultar_compromissos_filhos

| Campo | Tipo | Regra |
| --- | --- | --- |
| filho | string ou null | null = todos |
| de | data ou null | padrao hoje |
| ate | data ou null | padrao hoje mais 30 dias; "essa semana" = 7 dias |
| tipo | enum ou null | |
| incluir_concluidos | boolean ou null | |

Resposta: agrupada por filho, em ordem de data, com id, tipo, data, hora e, em aniversario de amigo,
o presente e a situacao. Inclui o aniversario do filho no periodo. Termina com os "a marcar". Sem
nada: `Nenhum compromisso de {filho} nesse periodo.` Quando `tipo` e `vacina` ou `consulta` (a
chamada natural para "que vacinas o Pedro precisa tomar?"), a resposta termina sempre com a linha:
`Nao indico quais vacinas ou consultas fazer. Isso e com o calendario oficial de vacinacao e o
pediatra. Aqui tenho so o que voce registrou.`

## atualizar_compromisso_filho

| Campo | Tipo | Regra |
| --- | --- | --- |
| id | inteiro | vem de `consultar_compromissos_filhos`; nunca inventar |
| acao | enum ou null | `concluir`, `cancelar`, `reabrir`, `presente_comprado` |
| nova_data | data ou null | remarca |
| nova_hora | `HH:MM` ou null | |
| titulo | string ou null | |
| avisar_dias_antes | inteiro ou null | |

Resposta: `Remarcado: #12 agora em 18/11 as 09:00.` / `Concluido: #12.` / `Presente comprado: #14.`
Concluir consulta de rotina acrescenta `Proxima consulta marcada para {data}.` Id de outra conta ou
inexistente: `Compromisso #{id} nao encontrado.`

## registrar_vacina

| Campo | Tipo | Regra |
| --- | --- | --- |
| filho | string ou null | |
| vacina | string 1 a 60 | |
| dose | string ou null | |
| data | data | nao pode ser futura |
| proxima_data | data ou null | |
| proxima_em_meses | inteiro 1 a 24 ou null | exclusivo com `proxima_data` |

Resposta: `Vacina registrada: Gripe, 2a dose, do Pedro em 06/11. Proxima dose: 06/05, com aviso.` Sem
proxima dose informada: `Registrada. Tem proxima dose? Se tiver, me diga a data.` O assistente nao
completa doses ou prazos por conta propria.

## Regras de prompt (src/prompt.ts)

Duas linhas novas, no mesmo tom das atuais:

```text
- Filhos: "tenho a Marina, 8 anos" e cadastrar_filho; prova, trabalho, consulta, vacina e aniversario de amiguinho sao registrar_compromisso_filho, com o filho certo (pergunte de qual quando houver mais de um e a mensagem nao disser) e data. "O que vem por ai dos meninos" e consultar_compromissos_filhos; concluir, remarcar e "ja comprei o presente" sao atualizar_compromisso_filho.
- Vacina aplicada ("o Pedro tomou a 2a dose da gripe hoje, proxima em 6 meses"): registrar_vacina. Nunca diga quais vacinas ou doses o filho deve tomar nem em que idade: so o que o usuario registrou, e mande consultar o calendario oficial e o pediatra.
```
