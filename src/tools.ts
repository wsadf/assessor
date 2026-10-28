import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  agendamentoDoDono,
  cancelar,
  linkDaPagina,
  listarAgendamentos,
  paginaDe,
  remarcar,
  type Agendamento,
  type SituacaoAgendamento,
} from "./agendamento.js";
import { AuthError } from "./auth.js";
import { config } from "./config.js";
import { cancelarEnvio, envioDaConta, listarEnvios, pedirEnvio, ultimasMensagens } from "./contatos.js";
import { contadoresDe, gerarConviteContador, revogarContador, type ContadorDaConta } from "./contador.js";
import { contasBancarias, faturaDoCartao, importarExtrato } from "./extratos.js";
import { conta, repoDoContexto, type Membro } from "./conta.js";
import type { Kind, Recurrence, Repo, Task, Transaction } from "./db.js";
import { documentos, nomePasta, PASTA_IDS, PASTAS, podeVerDocumento, type Documento } from "./documentos.js";
import {
  apagarEvento,
  conflitos,
  criarEvento,
  criarLink,
  desconectar as desconectarGoogle,
  estado as estadoGoogle,
  evento as eventoGoogle,
  GoogleExpirado,
  GoogleIndisponivel,
  GoogleNaoConectado,
  GoogleNaoConfigurado,
  listarEventos,
  moverEvento,
  type Evento,
} from "./google.js";
import {
  addDias,
  alterarRecorrencia,
  cancelarConta,
  compararMeses,
  criarConta,
  criarRecorrencia,
  definirPreferencia,
  descreverFrequencia,
  listarContas,
  listarRecorrencias,
  pagarConta,
  preferencias,
  TIPO_IDS,
  TIPOS_AVISO,
  type ContaPagar,
  type Recorrencia,
} from "./avisos.js";
import {
  contextoTitular,
  exigir,
  NOME_PERFIL,
  pode,
  PERFIS_CONVIDAVEIS,
  SemPermissao,
  type Capacidade,
  type Contexto,
} from "./permissoes.js";
import { brl, formatLocal, fromLocal, localDate, nextOccurrence } from "./time.js";
import { sendNotice } from "./whatsapp.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const nullableIsoDate = isoDate.nullish();
const dataHora = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "use YYYY-MM-DDTHH:mm");
const kind = z.enum(["despesa", "receita"]);
const recurrence = z.enum(["diario", "semanal", "mensal"]).nullish();

const schemas = {
  registrar_transacao: z.object({
    tipo: kind,
    valor: z.number().positive(),
    categoria: z.string().min(1),
    descricao: z.string().min(1),
    forma_pagamento: z.string().nullish(),
    data: nullableIsoDate,
    contraparte: z.string().min(1).nullish(),
    parcelas: z.number().int().min(2).max(60).nullish(),
  }),
  consultar_transacoes: z.object({
    data_inicio: isoDate,
    data_fim: isoDate,
    tipo: kind.nullish(),
    categoria: z.string().nullish(),
    contraparte: z.string().min(1).nullish(),
    busca: z.string().min(1).nullish(),
    valor_aproximado: z.number().positive().nullish(),
  }),
  editar_transacao: z.object({
    id: z.number().int(),
    tipo: kind.nullish(),
    valor: z.number().positive().nullish(),
    categoria: z.string().nullish(),
    descricao: z.string().nullish(),
    forma_pagamento: z.string().nullish(),
    data: nullableIsoDate,
    contraparte: z.string().min(1).nullish(),
  }),
  excluir_transacao: z.object({ id: z.number().int() }),
  criar_lembrete: z.object({
    texto: z.string().min(1),
    data_hora: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "use YYYY-MM-DDTHH:mm"),
    recorrencia: recurrence,
  }),
  listar_lembretes: z.object({}),
  cancelar_lembrete: z.object({ id: z.number().int() }),
  criar_tarefa: z.object({
    titulo: z.string().min(1),
    prazo: nullableIsoDate,
    prioridade: z.enum(["normal", "alta", "urgente"]).nullish(),
    projeto: z.string().min(1).nullish(),
  }),
  listar_tarefas: z.object({ incluir_concluidas: z.boolean().nullish() }),
  atualizar_tarefa: z.object({
    id: z.number().int(),
    status: z.enum(["pendente", "andamento", "concluida"]).nullish(),
    prazo: nullableIsoDate,
    prioridade: z.enum(["normal", "alta", "urgente"]).nullish(),
  }),
  listar_acessos: z.object({}),
  convidar_pessoa: z.object({ perfil: z.enum(PERFIS_CONVIDAVEIS), rotulo: z.string().min(1).nullish() }),
  alterar_acesso: z.object({ pessoa: z.string().min(1), perfil: z.enum(PERFIS_CONVIDAVEIS) }),
  remover_acesso: z.object({ pessoa: z.string().min(1), confirmado: z.boolean() }),
  guardar_documento: z.object({
    pasta: z.enum(PASTA_IDS),
    titulo: z.string().min(1).max(120),
    descricao: z.string().min(1).max(600).nullish(),
    data_documento: nullableIsoDate,
  }),
  buscar_documentos: z.object({
    consulta: z.string().min(1),
    pasta: z.enum(PASTA_IDS).nullish(),
    data_inicio: nullableIsoDate,
    data_fim: nullableIsoDate,
  }),
  enviar_documento: z.object({ id: z.number().int() }),
  mover_documento: z.object({ id: z.number().int(), pasta: z.enum(PASTA_IDS).nullish(), titulo: z.string().min(1).max(120).nullish() }),
  excluir_documento: z.object({ id: z.number().int(), confirmado: z.boolean() }),
  listar_pastas: z.object({}),
  cadastrar_conta_pagar: z.object({
    descricao: z.string().min(1).max(80),
    vencimento: isoDate,
    valor: z.number().positive().nullish(),
    categoria: z.string().min(1).nullish(),
    mensal: z.boolean(),
  }),
  listar_contas_pagar: z.object({ incluir_pagas: z.boolean().nullish() }),
  pagar_conta: z.object({
    id: z.number().int(),
    valor: z.number().positive().nullish(),
    data: nullableIsoDate,
    forma_pagamento: z.string().nullish(),
  }),
  cancelar_conta_pagar: z.object({ id: z.number().int() }),
  criar_recorrencia: z.object({
    tipo: kind,
    valor: z.number().positive(),
    categoria: z.string().min(1),
    descricao: z.string().min(1).max(80),
    frequencia: z.enum(["diaria", "semanal", "mensal"]),
    inicio: isoDate,
    contraparte: z.string().min(1).nullish(),
    forma_pagamento: z.string().nullish(),
  }),
  listar_recorrencias: z.object({}),
  alterar_recorrencia: z.object({
    id: z.number().int(),
    acao: z.enum(["pausar", "retomar", "cancelar"]).nullish(),
    valor: z.number().positive().nullish(),
  }),
  comparar_meses: z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/, "use YYYY-MM").nullish() }),
  configurar_avisos: z.object({
    tipo: z.enum(TIPO_IDS),
    ligado: z.boolean(),
    hora: z.number().int().min(0).max(23).nullish(),
  }),
  conectar_google_agenda: z.object({}),
  criar_compromisso: z.object({
    titulo: z.string().min(1).max(120),
    inicio: dataHora,
    duracao_minutos: z.number().int().min(5).max(720).nullish(),
    convidados: z.array(z.string().email()).max(20).nullish(),
    com_videochamada: z.boolean().nullish(),
    lembrar_minutos_antes: z.number().int().min(0).max(1440).nullish(),
    confirmar_conflito: z.boolean().nullish(),
  }),
  consultar_agenda: z.object({ data_inicio: isoDate, data_fim: isoDate, busca: z.string().min(1).nullish() }),
  remarcar_compromisso: z.object({ id: z.string().min(1), novo_inicio: dataHora, duracao_minutos: z.number().int().min(5).max(720).nullish() }),
  cancelar_compromisso: z.object({ id: z.string().min(1), confirmado: z.boolean() }),
  desconectar_google_agenda: z.object({ confirmado: z.boolean() }),
  link_de_agendamento: z.object({}),
  consultar_agendamentos: z.object({ data_inicio: isoDate, data_fim: isoDate, cliente: z.string().min(1).max(80).nullish() }),
  remarcar_agendamento: z.object({ id: z.number().int() }),
  cancelar_agendamento: z.object({ id: z.number().int(), confirmado: z.boolean() }),
  mensagem_para_contato: z.object({
    contato: z.string().min(1).max(60),
    telefone: z.string().min(1).nullish(),
    texto: z.string().min(1).max(500),
    data_hora: dataHora.nullish(),
    recorrencia: z.enum(["diario", "semanal", "mensal"]).nullish(),
    confirmado: z.boolean(),
  }),
  consultar_mensagens_contato: z.object({ contato: z.string().min(1).max(60).nullish() }),
  convidar_contador: z.object({ rotulo: z.string().min(1).max(40).nullish() }),
  importar_extrato: z.object({}),
  contas_bancarias: z.object({}),
  fatura_do_cartao: z.object({ cartao: z.string().min(1).max(60).nullish() }),
  cancelar_mensagem_contato: z.object({ id: z.number().int(), confirmado: z.boolean() }),
};

/** O que o turno do agente oferece as ferramentas alem da entrada do modelo. */
export interface ExtrasFerramenta {
  /** Arquivo pendente que chegou na mensagem deste turno. */
  anexoId?: number;
  /** Agenda o envio de um documento para depois da resposta em texto. */
  enviar?: (id: number) => void;
}

/** Capacidade exigida pelas ferramentas que nao dependem do tipo do lancamento. */
const CAPACIDADE: Partial<Record<keyof typeof schemas, Capacidade>> = {
  criar_lembrete: "agenda",
  listar_lembretes: "agenda",
  cancelar_lembrete: "agenda",
  criar_tarefa: "tarefas",
  listar_tarefas: "tarefas",
  atualizar_tarefa: "tarefas",
  convidar_pessoa: "acessos",
  alterar_acesso: "acessos",
  remover_acesso: "acessos",
  // enviar_documento fica de fora: o comprovante de um gasto visivel sai ate sem esta capacidade.
  guardar_documento: "documentos",
  buscar_documentos: "documentos",
  mover_documento: "documentos",
  excluir_documento: "documentos",
  listar_pastas: "documentos",
  // Recorrencias conferem o tipo dentro da ferramenta; configurar_avisos e pessoal e vale para todo perfil.
  cadastrar_conta_pagar: "despesas",
  listar_contas_pagar: "despesas",
  pagar_conta: "despesas",
  cancelar_conta_pagar: "despesas",
  comparar_meses: "despesas",
  conectar_google_agenda: "agenda",
  criar_compromisso: "agenda",
  consultar_agenda: "agenda",
  remarcar_compromisso: "agenda",
  cancelar_compromisso: "agenda",
  desconectar_google_agenda: "agenda",
  link_de_agendamento: "agenda",
  consultar_agendamentos: "agenda",
  remarcar_agendamento: "agenda",
  cancelar_agendamento: "agenda",
  convidar_contador: "acessos",
  // importar_extrato confere receitas tambem: o extrato traz as duas.
  importar_extrato: "despesas",
  contas_bancarias: "despesas",
  fatura_do_cartao: "despesas",
  mensagem_para_contato: "agenda",
  consultar_mensagens_contato: "agenda",
  cancelar_mensagem_contato: "agenda",
};

const GOOGLE = new Set<string>([
  "conectar_google_agenda",
  "criar_compromisso",
  "consultar_agenda",
  "remarcar_compromisso",
  "cancelar_compromisso",
  "desconectar_google_agenda",
  "link_de_agendamento",
  "consultar_agendamentos",
  "remarcar_agendamento",
  "cancelar_agendamento",
]);

const capDoTipo = (k: Kind): Capacidade => (k === "receita" ? "receitas" : "despesas");

export type ToolName = keyof typeof schemas;

const str = { type: "string" } as const;
const nullable = (t: object) => ({ anyOf: [t, { type: "null" }] });
const dateDesc = "Data no formato YYYY-MM-DD";

function tool(name: ToolName, description: string, properties: Record<string, object>): Anthropic.Tool {
  return {
    name,
    description,
    strict: true,
    input_schema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

export const toolDefinitions: Anthropic.Tool[] = [
  tool(
    "registrar_transacao",
    "Registra um gasto (despesa) ou um dinheiro recebido (receita). Use quando o usuario disser que gastou, pagou, comprou, recebeu, mandou Pix ou mandar foto de nota ou comprovante.",
    {
      tipo: { type: "string", enum: ["despesa", "receita"] },
      valor: { type: "number", description: "Valor em reais, ex.: 62.5. Em compra parcelada, o valor de CADA parcela; se o usuario so disser o total, divida pelo numero de parcelas" },
      categoria: { ...str, description: "Categoria curta em portugues, ex.: Alimentacao, Mercado, Transporte, Saude, Moradia, Lazer, Salario, Freela" },
      descricao: { ...str, description: "O que foi, ex.: Almoco no iFood, Relogio, Parcela do carro" },
      forma_pagamento: nullable({ ...str, description: "pix, debito, credito, dinheiro, boleto, ou o cartao citado" }),
      data: nullable({ ...str, description: `${dateDesc}. null = hoje. Em compra parcelada, a data da primeira parcela` }),
      contraparte: nullable({ ...str, description: "Pessoa ou estabelecimento do outro lado: quem recebeu o Pix, quem pagou, a loja. Ex.: Joao, iFood, Posto Shell. null se nao foi dito" }),
      parcelas: nullable({ type: "integer", description: "Numero de parcelas de uma compra parcelada (2 a 60). null se for a vista. Cria uma despesa por mes" }),
    },
  ),
  tool(
    "consultar_transacoes",
    "Soma e lista transacoes de um periodo. Use para perguntas como quanto gastei, quanto sobrou, gastos por categoria, quanto mandei de Pix para alguem, quanto gastei com um item, quanto ja paguei ou falta pagar de um parcelamento, onde foi um gasto.",
    {
      data_inicio: { ...str, description: dateDesc },
      data_fim: { ...str, description: `${dateDesc}, inclusiva. Para parcelas que ainda vao vencer, use uma data futura` },
      tipo: nullable({ type: "string", enum: ["despesa", "receita"] }),
      categoria: nullable({ ...str, description: "Filtra por uma categoria existente" }),
      contraparte: nullable({ ...str, description: "Filtra pela pessoa ou estabelecimento, ex.: Joao" }),
      busca: nullable({ ...str, description: "Palavra na descricao, contraparte ou categoria, ex.: relogio, carro" }),
      valor_aproximado: nullable({ type: "number", description: "Acha lancamentos de valor proximo (ate 5% de diferenca), para perguntas como onde gastei esses 200" }),
    },
  ),
  tool(
    "editar_transacao",
    "Corrige uma transacao ja registrada pelo id. Envie null nos campos que nao mudam.",
    {
      id: { type: "integer" },
      tipo: nullable({ type: "string", enum: ["despesa", "receita"] }),
      valor: nullable({ type: "number" }),
      categoria: nullable(str),
      descricao: nullable(str),
      forma_pagamento: nullable(str),
      data: nullable({ ...str, description: dateDesc }),
      contraparte: nullable({ ...str, description: "Pessoa ou estabelecimento" }),
    },
  ),
  tool("excluir_transacao", "Apaga uma transacao pelo id. So use depois que o usuario confirmar.", {
    id: { type: "integer" },
  }),
  tool(
    "criar_lembrete",
    "Agenda um lembrete enviado no WhatsApp na data e hora indicadas, uma vez ou recorrente.",
    {
      texto: { ...str, description: "O que lembrar, escrito como o aviso que sera enviado" },
      data_hora: { ...str, description: "Primeiro disparo, YYYY-MM-DDTHH:mm no horario local do usuario" },
      recorrencia: nullable({ type: "string", enum: ["diario", "semanal", "mensal"] }),
    },
  ),
  tool("listar_lembretes", "Lista os lembretes ativos do usuario.", {}),
  tool("cancelar_lembrete", "Cancela um lembrete ativo pelo id.", { id: { type: "integer" } }),
  tool(
    "criar_tarefa",
    "Cria uma tarefa (algo a fazer, sem horario marcado). Para avisos em data e hora, use criar_lembrete.",
    {
      titulo: { ...str, description: "O que fazer, curto, ex.: Revisar o contrato" },
      prazo: nullable({ ...str, description: `${dateDesc}. null = sem prazo` }),
      prioridade: nullable({ type: "string", enum: ["normal", "alta", "urgente"] }),
      projeto: nullable({ ...str, description: "Projeto ou assunto que agrupa tarefas, ex.: Mudanca do escritorio" }),
    },
  ),
  tool("listar_tarefas", "Lista as tarefas do usuario, das atrasadas e urgentes para as outras.", {
    incluir_concluidas: nullable({ type: "boolean" }),
  }),
  tool(
    "atualizar_tarefa",
    "Marca uma tarefa como feita, em andamento ou pendente, ou muda prazo e prioridade. Envie null no que nao muda.",
    {
      id: { type: "integer" },
      status: nullable({ type: "string", enum: ["pendente", "andamento", "concluida"] }),
      prazo: nullable({ ...str, description: dateDesc }),
      prioridade: nullable({ type: "string", enum: ["normal", "alta", "urgente"] }),
    },
  ),
  tool("listar_acessos", "Lista quem tem acesso a conta: o titular e as pessoas convidadas, com o perfil de cada uma.", {}),
  tool(
    "convidar_pessoa",
    "Gera um codigo de convite para outra pessoa entrar na conta com o proprio WhatsApp. So o titular pode convidar.",
    {
      perfil: {
        type: "string",
        enum: [...PERFIS_CONVIDAVEIS],
        description: "completo: ve e lanca tudo; so_gastos: registra e ve so despesas; agenda_tarefas: so lembretes e tarefas",
      },
      rotulo: nullable({ ...str, description: "Quem e a pessoa, ex.: Bia, socio" }),
    },
  ),
  tool("alterar_acesso", "Muda o perfil de uma pessoa que ja tem acesso a conta. So o titular pode alterar.", {
    pessoa: { ...str, description: "Nome da pessoa ou final do telefone" },
    perfil: { type: "string", enum: [...PERFIS_CONVIDAVEIS] },
  }),
  tool(
    "remover_acesso",
    "Tira o acesso de uma pessoa a conta. Chame primeiro com confirmado false, mostre ao usuario quem sera removido e so chame com true depois que ele confirmar.",
    {
      pessoa: { ...str, description: "Nome da pessoa ou final do telefone" },
      confirmado: { type: "boolean" },
    },
  ),
  tool(
    "guardar_documento",
    "Guarda o arquivo (PDF ou foto) que o usuario mandou nesta conversa. Use quando ele pedir para guardar. Leia o arquivo para escrever titulo e descricao.",
    {
      pasta: { type: "string", enum: [...PASTA_IDS], description: PASTAS.map((p) => `${p.id}: ${p.nome}`).join("; ") },
      titulo: { ...str, description: "Curto e especifico, ex.: Contrato de aluguel do apartamento, Boleto do condominio de novembro" },
      descricao: nullable({ ...str, description: "1 a 3 frases com nomes, datas, valores e numeros que aparecem no documento; e o que a busca vai encontrar depois" }),
      data_documento: nullable({ ...str, description: `${dateDesc} do proprio documento (assinatura, emissao, vencimento). null se nao houver` }),
    },
  ),
  tool(
    "buscar_documentos",
    "Procura documentos guardados pela descricao, como 'contrato do apartamento', 'comprovante do aluguel', 'CRLV do carro'.",
    {
      consulta: { ...str, description: "Palavras do pedido que identificam o documento: tipo, pessoa, empresa, assunto" },
      pasta: nullable({ type: "string", enum: [...PASTA_IDS] }),
      data_inicio: nullable({ ...str, description: `${dateDesc}. So se o usuario citar periodo` }),
      data_fim: nullable({ ...str, description: dateDesc }),
    },
  ),
  tool("enviar_documento", "Envia na conversa o arquivo de um documento guardado, pelo id que veio de buscar_documentos.", {
    id: { type: "integer" },
  }),
  tool("mover_documento", "Muda a pasta ou o titulo de um documento guardado. Envie null no que nao muda.", {
    id: { type: "integer" },
    pasta: nullable({ type: "string", enum: [...PASTA_IDS] }),
    titulo: nullable(str),
  }),
  tool(
    "excluir_documento",
    "Apaga um documento guardado. Chame com confirmado false, mostre qual e, e so chame com true depois que o usuario confirmar.",
    { id: { type: "integer" }, confirmado: { type: "boolean" } },
  ),
  tool("listar_pastas", "Mostra as pastas de documentos com a quantidade em cada uma e o espaco usado.", {}),
  tool(
    "cadastrar_conta_pagar",
    "Cadastra uma conta a pagar com vencimento (condominio, fatura do cartao, IPVA). O assessor avisa na vespera.",
    {
      descricao: { ...str, description: "Nome curto da conta, ex.: Condominio, Fatura Nubank" },
      vencimento: { ...str, description: `${dateDesc} do proximo vencimento` },
      valor: nullable({ type: "number", description: "Valor em reais; null quando varia, como fatura de cartao" }),
      categoria: nullable({ ...str, description: "Categoria da despesa ao pagar. null = Contas" }),
      mensal: { type: "boolean", description: "true se vence todo mes no mesmo dia" },
    },
  ),
  tool("listar_contas_pagar", "Lista as contas a pagar em aberto, das que vencem antes.", {
    incluir_pagas: nullable({ type: "boolean" }),
  }),
  tool(
    "pagar_conta",
    "Registra o pagamento de uma conta a pagar cadastrada: lanca a despesa e, se for mensal, passa o vencimento para o mes seguinte. Use quando o usuario disser 'paguei' uma conta que esta na lista.",
    {
      id: { type: "integer" },
      valor: nullable({ type: "number", description: "Valor pago em reais; null usa o cadastrado" }),
      data: nullable({ ...str, description: `${dateDesc}. null = hoje` }),
      forma_pagamento: nullable(str),
    },
  ),
  tool("cancelar_conta_pagar", "Remove uma conta a pagar da lista e para os avisos dela.", { id: { type: "integer" } }),
  tool(
    "criar_recorrencia",
    "Cria um gasto ou receita que se repete e e lancado sozinho, ex.: 'toda segunda tem 89,90 da academia', 'todo dia 5 recebo o salario'.",
    {
      tipo: { type: "string", enum: ["despesa", "receita"] },
      valor: { type: "number", description: "Valor em reais de cada lancamento" },
      categoria: { ...str, description: "Categoria curta, ex.: Saude, Salario" },
      descricao: { ...str, description: "O que e, ex.: Academia" },
      frequencia: { type: "string", enum: ["diaria", "semanal", "mensal"] },
      inicio: { ...str, description: `${dateDesc} do primeiro lancamento; define o dia da semana ou do mes que se repete` },
      contraparte: nullable(str),
      forma_pagamento: nullable(str),
    },
  ),
  tool("listar_recorrencias", "Lista os gastos e receitas recorrentes, com a proxima data.", {}),
  tool("alterar_recorrencia", "Pausa, retoma ou cancela uma recorrencia, ou muda o valor. Envie null no que nao muda.", {
    id: { type: "integer" },
    acao: nullable({ type: "string", enum: ["pausar", "retomar", "cancelar"] }),
    valor: nullable({ type: "number" }),
  }),
  tool(
    "comparar_meses",
    "Compara os gastos de um mes com o anterior: total e as categorias que mais mudaram. No mes atual, compara ate o mesmo dia.",
    { mes: nullable({ ...str, description: "YYYY-MM. null = mes atual" }) },
  ),
  tool(
    "configurar_avisos",
    "Liga ou desliga um tipo de aviso automatico para quem fala, e muda o horario.",
    {
      tipo: { type: "string", enum: [...TIPO_IDS], description: TIPO_IDS.map((t) => `${t}: ${TIPOS_AVISO[t].descricao}`).join("; ") },
      ligado: { type: "boolean" },
      hora: nullable({ type: "integer", description: "Hora local de 0 a 23. null mantem a atual" }),
    },
  ),
  tool("conectar_google_agenda", "Manda o link para a pessoa ligar a propria conta do Google Agenda ao assessor.", {}),
  tool(
    "criar_compromisso",
    "Marca um compromisso com dia e hora no Google Agenda de quem fala e cria o lembrete no WhatsApp. Sem Google conectado, cria so o lembrete. Para aviso solto sem compromisso, use criar_lembrete.",
    {
      titulo: { ...str, description: "Curto, ex.: Dentista, Reuniao com a Ana" },
      inicio: { ...str, description: "YYYY-MM-DDTHH:mm no horario local" },
      duracao_minutos: nullable({ type: "integer", description: "null = 60" }),
      convidados: nullable({ type: "array", items: { type: "string" }, description: "E-mails de quem convidar" }),
      com_videochamada: nullable({ type: "boolean", description: "true para criar link do Google Meet" }),
      lembrar_minutos_antes: nullable({ type: "integer", description: "Aviso no WhatsApp antes do compromisso. null = 60, 0 = sem aviso" }),
      confirmar_conflito: nullable({ type: "boolean", description: "true so depois que o usuario aceitar marcar em cima de outro compromisso" }),
    },
  ),
  tool("consultar_agenda", "Lista os compromissos do Google Agenda de quem fala num periodo, com o id de cada um.", {
    data_inicio: { ...str, description: dateDesc },
    data_fim: { ...str, description: `${dateDesc}, inclusiva` },
    busca: nullable({ ...str, description: "Palavra do titulo, ex.: dentista" }),
  }),
  tool("remarcar_compromisso", "Muda o horario de um compromisso pelo id que veio de consultar_agenda. Os convidados sao avisados pelo Google.", {
    id: str,
    novo_inicio: { ...str, description: "YYYY-MM-DDTHH:mm no horario local" },
    duracao_minutos: nullable({ type: "integer", description: "null mantem a duracao" }),
  }),
  tool("cancelar_compromisso", "Apaga um compromisso pelo id. Chame com confirmado false, mostre qual e, e so chame com true depois que o usuario confirmar.", {
    id: str,
    confirmado: { type: "boolean" },
  }),
  tool("desconectar_google_agenda", "Desliga o Google Agenda de quem fala e apaga o acesso guardado. Confirme antes.", {
    confirmado: { type: "boolean" },
  }),
  tool("link_de_agendamento", "Devolve o link da pagina publica onde os clientes de quem fala marcam horario sozinhos.", {}),
  tool(
    "consultar_agendamentos",
    "Lista os horarios que clientes marcaram pela pagina de agendamento de quem fala, com o id de cada um. Use antes de remarcar ou cancelar.",
    {
      data_inicio: { ...str, description: dateDesc },
      data_fim: { ...str, description: `${dateDesc}, inclusiva` },
      cliente: nullable({ ...str, description: "Parte do nome do cliente, ex.: Camila" }),
    },
  ),
  tool(
    "remarcar_agendamento",
    "Quando quem atende nao pode no horario marcado por um cliente: manda ao cliente ate tres horarios livres para ele escolher pelo WhatsApp.",
    { id: { type: "integer", description: "Id que veio de consultar_agendamentos" } },
  ),
  tool(
    "cancelar_agendamento",
    "Cancela um horario marcado por cliente, apaga o evento e avisa o cliente. Chame com confirmado false, mostre qual e, e so chame com true depois que o usuario confirmar.",
    { id: { type: "integer" }, confirmado: { type: "boolean" } },
  ),
  tool(
    "importar_extrato",
    "Importa o extrato ou a fatura do cartao em OFX que o usuario mandou nesta conversa: cada movimentacao vira lancamento, sem duplicar o que ja foi registrado.",
    {},
  ),
  tool("contas_bancarias", "Lista as contas e cartoes com extrato importado, o saldo do ultimo extrato e, nos cartoes, fechamento e vencimento.", {}),
  tool(
    "fatura_do_cartao",
    "Responde sobre a fatura do cartao importado: valor em aberto, se a ultima ja fechou, fechamento, vencimento e compras do mes no credito.",
    { cartao: nullable({ ...str, description: "Nome ou final do cartao; null para todos" }) },
  ),
  tool(
    "convidar_contador",
    "Gera um codigo para o contador ver, so para leitura, os lancamentos e os documentos fiscais de cada mes no painel. So o titular pode.",
    { rotulo: nullable({ ...str, description: "Quem e o contador, ex.: Escritorio Silva" }) },
  ),
  tool(
    "mensagem_para_contato",
    "Manda uma mensagem pelo WhatsApp para outra pessoa em nome de quem fala, agora, numa data ou repetindo, ex.: 'lembra o Joao de pagar o personal todo dia 5'. Chame primeiro com confirmado false, mostre a previa ao usuario e so chame com true depois que ele confirmar.",
    {
      contato: { ...str, description: "Nome da pessoa, como o usuario chama" },
      telefone: nullable({ ...str, description: "WhatsApp com DDD. null para usar o contato ja salvo; se a ferramenta pedir o numero, pergunte ao usuario" }),
      texto: { ...str, description: "So o recado, curto e educado, ex.: 'Lembrete: o pagamento do personal vence hoje.' A saudacao, quem manda e o PARAR entram sozinhos" },
      data_hora: nullable({ ...str, description: "YYYY-MM-DDTHH:mm no horario local do primeiro envio. null = agora" }),
      recorrencia: nullable({ type: "string", enum: ["diario", "semanal", "mensal"] }),
      confirmado: { type: "boolean" },
    },
  ),
  tool(
    "consultar_mensagens_contato",
    "Mostra os envios agendados ou recorrentes para outras pessoas e as ultimas mensagens enviadas, com situacao (enviada, entregue, lida, falhou) e a resposta, se houve.",
    { contato: nullable({ ...str, description: "Parte do nome, ex.: Joao" }) },
  ),
  tool(
    "cancelar_mensagem_contato",
    "Para os envios futuros de um pedido, pelo id de consultar_mensagens_contato, ex.: 'para de cobrar o Joao'. Chame com confirmado false, mostre qual e, e so chame com true depois da confirmacao.",
    { id: { type: "integer" }, confirmado: { type: "boolean" } },
  ),
];

const describeConta = (c: ContaPagar) =>
  `#${c.id} ${c.description}, vence ${c.due_on}, ${c.amount_cents ? brl(c.amount_cents) : "valor variavel"}, ${c.due_day ? "mensal" : "unica"}`;
const describeRecorrencia = (r: Recorrencia) =>
  `#${r.id} ${r.description}: ${r.kind} de ${brl(r.amount_cents)} em ${r.category}, ${descreverFrequencia(r)}${r.status === "pausada" ? " (pausada)" : `, proximo em ${r.next_on}`}`;

const dataDoc = (d: Documento) => d.document_date ?? d.saved_at?.slice(0, 10) ?? d.created_at.slice(0, 10);
const describeDoc = (d: Documento) => `#${d.id} ${d.title ?? d.original_name} (${nomePasta(d.folder)}, ${dataDoc(d)})`;
const mb = (bytes: number) => `${(bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

/** Pendente desta mensagem ou, sem ele, o ultimo que esta pessoa mandou. */
function anexoPendente(repo: Repo, ctx: Contexto, extras: ExtrasFerramenta): Documento | undefined {
  const docs = documentos(repo.db);
  const doTurno = extras.anexoId ? docs.porId(extras.anexoId) : undefined;
  const anexo = doTurno ?? docs.ultimoPendente(ctx.membro);
  return anexo && anexo.status === "pendente" && anexo.created_by === ctx.membro && anexo.phone === ctx.conta ? anexo : undefined;
}

/** Foto ou PDF da mensagem que virou lancamento fica guardado como comprovante dele. */
function guardarComprovante(repo: Repo, ctx: Contexto, extras: ExtrasFerramenta, t: Transaction): string {
  if (!extras.anexoId) return "";
  const anexo = anexoPendente(repo, ctx, extras);
  if (!anexo || anexo.id !== extras.anexoId) return "";
  try {
    const { documento } = documentos(repo.db).guardar(anexo.id, {
      pasta: /pix|transf/i.test(t.payment_method ?? "") ? "comprovantes" : "notas_fiscais",
      titulo: t.counterpart ? `${t.description} - ${t.counterpart}` : t.description,
      dataDocumento: t.occurred_on,
      transacaoId: t.id,
    });
    return ` Comprovante guardado (#${documento.id}).`;
  } catch (err) {
    if (err instanceof AuthError) return ` O comprovante nao foi guardado: ${err.message}`;
    throw err;
  }
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acha a pessoa pelo nome ou pelo final do telefone; mais de uma devolve a lista para o modelo perguntar. */
function acharMembro(membros: Membro[], pessoa: string): Membro | string {
  const alvo = semAcento(pessoa.trim());
  const digitos = pessoa.replace(/\D/g, "");
  const achados = membros.filter(
    (m) => (digitos.length >= 4 && m.telefone.endsWith(digitos)) || (!!m.nome && semAcento(m.nome).includes(alvo)),
  );
  if (achados.length === 1) return achados[0];
  if (achados.length === 0) return `Ninguem com acesso a conta corresponde a "${pessoa}". ${listarMembros(membros)}`;
  return `Mais de uma pessoa corresponde a "${pessoa}". Pergunte qual: ${listarMembros(achados)}`;
}

/** Contador pelo nome, rotulo ou final do telefone, ou pela palavra "contador" quando ha um so. */
function acharContador(contadores: ContadorDaConta[], pessoa: string) {
  const alvo = semAcento(pessoa.trim());
  const digitos = pessoa.replace(/\D/g, "");
  const achados = contadores.filter(
    (c) =>
      (digitos.length >= 4 && c.telefone.endsWith(digitos)) ||
      (!!c.nome && semAcento(c.nome).includes(alvo)) ||
      (!!c.rotulo && semAcento(c.rotulo).includes(alvo)),
  );
  if (achados.length === 1) return achados[0];
  return /contador/.test(alvo) && contadores.length === 1 ? contadores[0] : null;
}

const finalTel = (phone: string) => phone.slice(-4);
const listarMembros = (membros: Membro[]) =>
  membros.length
    ? membros.map((m) => `${m.nome ?? "Sem nome"} (final ${finalTel(m.telefone)}): ${NOME_PERFIL[m.perfil]}, desde ${m.desde.slice(0, 10)}`).join("; ")
    : "Ninguem alem do titular tem acesso.";

function describeTask(t: Task) {
  const prazo = t.due_on ? ` | prazo ${t.due_on}` : "";
  const projeto = t.project ? ` | ${t.project}` : "";
  return `#${t.id} [${t.status}] ${t.title} | ${t.priority}${prazo}${projeto}`;
}

const toCents = (v: number) => Math.round(v * 100);

function describe(t: Transaction) {
  const pay = t.payment_method ? `, ${t.payment_method}` : "";
  const quem = t.counterpart ? ` | ${t.kind === "receita" ? "de" : "para"} ${t.counterpart}` : "";
  const parcela = t.installment_total ? ` | parcela ${t.installment_number}/${t.installment_total}` : "";
  const origem = t.source === "extrato" ? " [extrato]" : "";
  return `#${t.id} ${t.occurred_on} ${t.kind} ${brl(t.amount_cents)} | ${t.category} | ${t.description}${quem}${pay}${parcela}${origem}`;
}

const somaPor = (rows: Transaction[], chave: (t: Transaction) => string | null) => {
  const mapa = new Map<string, number>();
  for (const r of rows) {
    const k = chave(r);
    if (k) mapa.set(k, (mapa.get(k) ?? 0) + r.amount_cents);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${brl(v)}`);
};

export { nextOccurrence };

/** `quem` aceita so o telefone para o titular de uma conta sem membros, como no terminal. */
/** Recusa volta como resposta, nao como erro: o modelo precisa repassar ao usuario. */
const recusa = (err: unknown) => {
  if (err instanceof SemPermissao || err instanceof AuthError) return err.message;
  throw err;
};

function preparar(quem: string | Contexto, name: string, rawInput: unknown) {
  if (!(name in schemas)) throw new Error(`Ferramenta desconhecida: ${name}`);
  const toolName = name as ToolName;
  const parsed = schemas[toolName].safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`Entrada invalida: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return { toolName, input: parsed.data as any, ctx: typeof quem === "string" ? contextoTitular(quem) : quem };
}

/** Ferramentas locais, sincronas. `quem` aceita so o telefone para o titular de uma conta sem membros. */
export function executeTool(repoConta: Repo, quem: string | Contexto, name: string, rawInput: unknown, extras: ExtrasFerramenta = {}): string {
  if (GOOGLE.has(name)) throw new Error(`${name} fala com o Google e e assincrona: use executarFerramenta.`);
  const { toolName, input, ctx } = preparar(quem, name, rawInput);
  try {
    const cap = CAPACIDADE[toolName];
    if (cap) exigir(ctx, cap);
    return run(repoDoContexto(repoConta, ctx), ctx, toolName, input, extras);
  } catch (err) {
    return recusa(err);
  }
}

/** Qualquer ferramenta, inclusive as do Google; e a que o agente usa. */
export async function executarFerramenta(
  repoConta: Repo,
  quem: string | Contexto,
  name: string,
  rawInput: unknown,
  extras: ExtrasFerramenta = {},
): Promise<string> {
  if (!GOOGLE.has(name)) return executeTool(repoConta, quem, name, rawInput, extras);
  const { toolName, input, ctx } = preparar(quem, name, rawInput);
  try {
    exigir(ctx, CAPACIDADE[toolName]!);
    return await agendaGoogle(repoDoContexto(repoConta, ctx), ctx, toolName, input);
  } catch (err) {
    return recusa(err);
  }
}

function run(repo: Repo, ctx: Contexto, toolName: ToolName, input: any, extras: ExtrasFerramenta): string {
  const phone = ctx.conta;
  const autoria = { created_by: ctx.membro };
  switch (toolName) {
    case "registrar_transacao": {
      exigir(ctx, capDoTipo(input.tipo));
      const base = {
        ...autoria,
        phone,
        kind: input.tipo,
        amount_cents: toCents(input.valor),
        category: input.categoria,
        description: input.descricao,
        payment_method: input.forma_pagamento,
        occurred_on: input.data ?? localDate(),
        counterpart: input.contraparte,
      };
      if (input.parcelas) {
        const parcelas = repo.addInstallments(base, input.parcelas);
        const ultima = parcelas.at(-1)!;
        return [
          `Parcelamento registrado: ${input.parcelas}x de ${brl(base.amount_cents)}, total ${brl(base.amount_cents * input.parcelas)}.`,
          `Primeira: ${describe(parcelas[0])}`,
          `Ultima em ${ultima.occurred_on}.${guardarComprovante(repo, ctx, extras, parcelas[0])}`,
        ].join("\n");
      }
      const t = repo.addTransaction(base);
      const month = t.occurred_on.slice(0, 7);
      const monthTotal = repo
        .listTransactions(phone, `${month}-01`, `${month}-31`, { kind: t.kind, category: t.category })
        .reduce((s, x) => s + x.amount_cents, 0);
      return `Registrado: ${describe(t)}. Total de ${t.category} no mes: ${brl(monthTotal)}.${guardarComprovante(repo, ctx, extras, t)}`;
    }

    case "consultar_transacoes": {
      if (input.tipo) exigir(ctx, capDoTipo(input.tipo));
      else if (!pode(ctx, "receitas")) exigir(ctx, "despesas");
      const alvo = input.valor_aproximado ? toCents(input.valor_aproximado) : null;
      const rows = repo
        .listTransactions(phone, input.data_inicio, input.data_fim, {
          kind: input.tipo ?? undefined,
          category: input.categoria ?? undefined,
          counterpart: input.contraparte ?? undefined,
          search: input.busca ?? undefined,
        })
        .filter((r) => alvo === null || Math.abs(r.amount_cents - alvo) <= Math.max(alvo * 0.05, 100));
      if (rows.length === 0) {
        const cats = repo.categories(phone);
        const quem = repo.counterparts(phone);
        return [
          "Nenhuma transacao no periodo com esses filtros.",
          cats.length ? `Categorias existentes: ${cats.join(", ")}.` : "",
          quem.length ? `Pessoas e lojas registradas: ${quem.slice(0, 30).join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join(" ");
      }
      const sum = (k: string) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount_cents, 0);
      const despesas = rows.filter((r) => r.kind === "despesa");
      const cats = somaPor(despesas, (r) => r.category);
      const contrapartes = somaPor(rows, (r) => r.counterpart);
      const hoje = localDate();
      const parcelasFuturas = rows.filter((r) => r.installment_total && r.occurred_on > hoje);
      const latest = rows.slice(0, 15).map(describe);
      return [
        `Periodo ${input.data_inicio} a ${input.data_fim}: ${rows.length} transacoes.`,
        pode(ctx, "receitas") && pode(ctx, "despesas")
          ? `Despesas: ${brl(sum("despesa"))}. Receitas: ${brl(sum("receita"))}. Saldo: ${brl(sum("receita") - sum("despesa"))}.`
          : pode(ctx, "receitas")
            ? `Receitas: ${brl(sum("receita"))}.`
            : `Despesas: ${brl(sum("despesa"))}.`,
        cats.length ? `Despesas por categoria: ${cats.join("; ")}.` : "",
        contrapartes.length ? `Por pessoa ou loja: ${contrapartes.slice(0, 10).join("; ")}.` : "",
        parcelasFuturas.length
          ? `Parcelas ainda por vencer no periodo: ${parcelasFuturas.length}, somando ${brl(parcelasFuturas.reduce((s, r) => s + r.amount_cents, 0))}.`
          : "",
        `Mais recentes:\n${latest.join("\n")}${rows.length > 15 ? `\n(+${rows.length - 15} anteriores)` : ""}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "editar_transacao": {
      if (input.tipo) exigir(ctx, capDoTipo(input.tipo));
      const before = repo.getTransaction(phone, input.id);
      if (!before) return `Transacao #${input.id} nao encontrada.`;
      const after = repo.updateTransaction(phone, input.id, {
        kind: input.tipo ?? undefined,
        amount_cents: input.valor != null ? toCents(input.valor) : undefined,
        category: input.categoria ?? undefined,
        description: input.descricao ?? undefined,
        payment_method: input.forma_pagamento ?? undefined,
        occurred_on: input.data ?? undefined,
        counterpart: input.contraparte ?? undefined,
      })!;
      return `Atualizado.\nAntes: ${describe(before)}\nAgora: ${describe(after)}`;
    }

    case "excluir_transacao": {
      const t = repo.getTransaction(phone, input.id);
      if (!t || !repo.deleteTransaction(phone, input.id)) return `Transacao #${input.id} nao encontrada.`;
      return `Excluido: ${describe(t)}`;
    }

    case "criar_lembrete": {
      const when = fromLocal(input.data_hora);
      if (when.getTime() < Date.now() - 60_000) return `Esse horario (${formatLocal(when)}) ja passou. Confirme a data com o usuario.`;
      const r = repo.addReminder(phone, input.texto, when, input.recorrencia, { ...autoria, notify_phone: ctx.membro });
      return `Lembrete #${r.id} criado para ${formatLocal(when)}${r.recurrence ? `, repete ${r.recurrence}` : ""}: ${r.text}`;
    }

    case "listar_lembretes": {
      const list = repo.listReminders(phone);
      if (list.length === 0) return "Nenhum lembrete ativo.";
      return list
        .map((r) => `#${r.id} ${formatLocal(new Date(r.next_run_at))}${r.recurrence ? ` (${r.recurrence})` : ""}: ${r.text}`)
        .join("\n");
    }

    case "cancelar_lembrete":
      return repo.cancelReminder(phone, input.id)
        ? `Lembrete #${input.id} cancelado.`
        : `Lembrete #${input.id} nao encontrado ou ja encerrado.`;

    case "criar_tarefa": {
      const t = repo.addTask(phone, {
        ...autoria,
        title: input.titulo,
        due_on: input.prazo,
        priority: input.prioridade ?? "normal",
        project: input.projeto,
      });
      return `Tarefa criada: ${describeTask(t)}`;
    }

    case "listar_tarefas": {
      const list = repo.listTasks(phone).filter((t) => input.incluir_concluidas || t.status !== "concluida");
      if (list.length === 0) return "Nenhuma tarefa.";
      const today = localDate();
      return list.map((t) => describeTask(t) + (t.status !== "concluida" && t.due_on && t.due_on < today ? " | ATRASADA" : "")).join("\n");
    }

    case "atualizar_tarefa": {
      const t = repo.updateTask(phone, input.id, {
        status: input.status ?? undefined,
        due_on: input.prazo ?? undefined,
        priority: input.prioridade ?? undefined,
      });
      return t ? `Atualizada: ${describeTask(t)}` : `Tarefa #${input.id} nao encontrada.`;
    }

    case "listar_acessos": {
      const membros = conta(repo.db).listarMembros(phone);
      const contadores = contadoresDe(repo.db, phone).map(
        (c) =>
          `Contador: ${c.nome ?? "sem nome"}${c.rotulo ? ` (${c.rotulo})` : ""}, desde ${c.desde.slice(0, 10)}, ultimo acesso ${c.ultimoAcesso ? formatLocal(new Date(c.ultimoAcesso)) : "nunca"}`,
      );
      return [`Titular: ${ctx.titular ?? "sem nome"}. ${listarMembros(membros)}`, ...contadores].join("\n");
    }

    case "importar_extrato": {
      exigir(ctx, "receitas");
      const anexo = anexoPendente(repo, ctx, extras);
      const docs = documentos(repo.db);
      const dados = anexo ? docs.ler(anexo) : null;
      if (!anexo || !dados || !/<OFX>/i.test(dados.subarray(0, 4000).toString("latin1"))) {
        return "Nenhum extrato OFX recebido. Peca ao usuario para exportar o extrato ou a fatura em OFX no app ou site do banco e mandar o arquivo aqui.";
      }
      try {
        const r = importarExtrato(repo, ctx, dados, anexo.original_name);
        docs.excluir(anexo.id);
        const periodo = r.de && r.ate ? ` de ${r.de} a ${r.ate}` : "";
        return [
          `Extrato importado: ${r.contaBancaria.nome}${periodo}.`,
          `${r.criados} lancamentos novos, ${r.unidos} unidos a lancamentos ja registrados, ${r.ignorados} ignorados (ja importados, pagamento de fatura ou investimento)${r.estornados ? `, ${r.estornados} compras estornadas` : ""}.`,
          r.contaBancaria.tipo === "cartao" && !r.contaBancaria.fechamento
            ? "Para responder sobre a fatura, o usuario pode informar o dia de fechamento e de vencimento em Financas > Extratos."
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Arquivo nao parece")) return "Esse arquivo nao parece um extrato OFX. Peca o arquivo OFX exportado do banco.";
        throw err;
      }
    }

    case "contas_bancarias": {
      const contas = contasBancarias(repo.db, ctx);
      if (!contas.length) return "Nenhum extrato importado ainda. Da para mandar o OFX do banco aqui ou em Financas > Extratos no painel.";
      return contas
        .map(
          (c) =>
            `${c.name} (${c.type})${c.balance_cents !== null ? `: saldo ${brl(c.balance_cents)} em ${c.balance_at}` : ""}${c.type === "cartao" ? `, fechamento ${c.close_day ?? "?"}, vencimento ${c.due_day ?? "?"}` : ""}, ultima importacao ${c.last_import_at ? formatLocal(new Date(c.last_import_at)) : "-"}`,
        )
        .join("\n");
    }

    case "fatura_do_cartao": {
      const faturas = faturaDoCartao(repo.db, ctx, input.cartao, localDate());
      if (!faturas.length) return "Nenhum cartao com fatura importada. Peca o OFX da fatura do cartao.";
      return faturas
        .map((f) =>
          f.configurado
            ? [
                `${f.cartao}: fatura em aberto ${brl(Math.round(f.aberta.total * 100))} (${f.aberta.quantidade} compras), fecha em ${f.aberta.fechamento} e vence em ${f.aberta.vencimento}.`,
                `Ultima fatura fechou em ${f.ultimaFechada.fechamento}: ${brl(Math.round(f.ultimaFechada.total * 100))}, ${f.ultimaFechada.aPagar ? `vence em ${f.ultimaFechada.vencimento}` : `venceu em ${f.ultimaFechada.vencimento}`}.`,
                `No credito este mes: ${brl(Math.round(f.comprasNoMes * 100))}.`,
              ].join(" ")
            : `${f.cartao}: no credito este mes ${brl(Math.round(f.comprasNoMes * 100))} em ${f.quantidade} compras. Para saber fechamento e vencimento, o usuario informa os dias em Financas > Extratos.`,
        )
        .join("\n");
    }

    case "convidar_contador": {
      const c = gerarConviteContador(repo.db, ctx, input.rotulo);
      return [
        `Convite de contador criado: ${c.codigo}, vale ate ${new Date(c.validoAte).toLocaleDateString("pt-BR", { timeZone: config.timezone })} e serve uma vez.`,
        `Texto para o usuario encaminhar: "${c.mensagemWhatsapp}"`,
      ].join("\n");
    }

    case "convidar_pessoa": {
      const c = conta(repo.db).gerarConvite(phone, input.perfil, input.rotulo);
      const ate = new Date(c.validoAte).toLocaleDateString("pt-BR", { timeZone: config.timezone });
      return [
        `Convite criado: ${c.codigo}, perfil ${NOME_PERFIL[c.perfil]}, vale ate ${ate} e serve uma vez.`,
        `Texto para o usuario encaminhar: "Use o codigo ${c.codigo} em Criar conta no painel do Assessor para entrar na conta de ${ctx.titular ?? "quem te convidou"}. Vale ate ${ate}."`,
      ].join("\n");
    }

    case "alterar_acesso": {
      const c = conta(repo.db);
      const m = acharMembro(c.listarMembros(phone), input.pessoa);
      if (typeof m === "string") return m;
      c.alterarPerfil(phone, m.telefone, input.perfil);
      return `${m.nome ?? "A pessoa"} agora tem perfil ${NOME_PERFIL[input.perfil as Membro["perfil"]]}.`;
    }

    case "remover_acesso": {
      const c = conta(repo.db);
      const contador = acharContador(contadoresDe(repo.db, phone), input.pessoa);
      if (contador) {
        const nome = contador.nome ?? contador.rotulo ?? "o contador";
        if (!input.confirmado) return `Confirme com o usuario antes: tirar o acesso de contador de ${nome}? Ele deixa de ver o dossie na hora.`;
        revogarContador(repo.db, ctx, contador.id);
        return `${nome} nao e mais contador desta conta.`;
      }
      const m = acharMembro(c.listarMembros(phone), input.pessoa);
      if (typeof m === "string") return m;
      if (!input.confirmado) {
        return `Confirme com o usuario antes: remover ${m.nome ?? "a pessoa"} (final ${finalTel(m.telefone)}, ${NOME_PERFIL[m.perfil]})? O que ela lancou continua na conta.`;
      }
      c.removerMembro(phone, m.telefone);
      return `${m.nome ?? "A pessoa"} nao tem mais acesso a conta. Os lancamentos dela continuam aqui.`;
    }

    case "guardar_documento": {
      const anexo = anexoPendente(repo, ctx, extras);
      if (!anexo) return "Nenhum arquivo recebido para guardar. Peca ao usuario para enviar o arquivo pelo WhatsApp.";
      const r = documentos(repo.db).guardar(anexo.id, {
        pasta: input.pasta,
        titulo: input.titulo,
        descricao: input.descricao,
        dataDocumento: input.data_documento,
      });
      const aviso = r.alerta ? ` Atencao: a conta ja usa ${mb(r.uso)} de 1 GB; exclua documentos antigos para nao faltar espaco.` : "";
      return `Guardado: ${describeDoc(r.documento)}.${aviso}`;
    }

    case "buscar_documentos": {
      const achados = documentos(repo.db).buscar(phone, input.consulta, { pasta: input.pasta, de: input.data_inicio, ate: input.data_fim });
      if (!achados.length) return `Nenhum documento encontrado para "${input.consulta}". Diga ao usuario que nao achou; nao invente.`;
      return [
        `${achados.length} documento(s), do mais provavel para o menos:`,
        ...achados.map((d) => `${describeDoc(d)}${d.description ? `: ${d.description.slice(0, 160)}` : ""}`),
      ].join("\n");
    }

    case "enviar_documento": {
      const doc = documentos(repo.db).porId(input.id);
      if (!podeVerDocumento(repo, ctx, doc) || doc.status !== "guardado") return `Documento #${input.id} nao encontrado.`;
      extras.enviar?.(doc.id);
      return `Arquivo ${describeDoc(doc)} sera enviado logo apos a sua resposta.`;
    }

    case "mover_documento": {
      const docs = documentos(repo.db);
      const antes = docs.porId(input.id);
      if (!podeVerDocumento(repo, ctx, antes) || antes.status !== "guardado") return `Documento #${input.id} nao encontrado.`;
      const depois = docs.atualizar(antes.id, { pasta: input.pasta ?? undefined, titulo: input.titulo ?? undefined })!;
      return `Atualizado.\nAntes: ${describeDoc(antes)}\nAgora: ${describeDoc(depois)}`;
    }

    case "excluir_documento": {
      const docs = documentos(repo.db);
      const doc = docs.porId(input.id);
      if (!podeVerDocumento(repo, ctx, doc) || doc.status !== "guardado") return `Documento #${input.id} nao encontrado.`;
      if (!input.confirmado) return `Confirme com o usuario antes de apagar ${describeDoc(doc)}. O arquivo some de vez.`;
      docs.excluir(doc.id);
      return `Excluido: ${describeDoc(doc)}.`;
    }

    case "listar_pastas": {
      const docs = documentos(repo.db);
      const pastas = docs.pastasComUso(phone).filter((p) => p.qtd);
      if (!pastas.length) return "Nenhum documento guardado ainda.";
      return `${pastas.map((p) => `${p.nome}: ${p.qtd}`).join("; ")}. Espaco usado: ${mb(docs.uso(phone))} de 1 GB.`;
    }

    case "cadastrar_conta_pagar": {
      const c = criarConta(repo.db, ctx, input);
      return `Conta a pagar cadastrada: ${describeConta(c)}. Aviso na vespera do vencimento.`;
    }

    case "listar_contas_pagar": {
      const hoje = localDate();
      const contas = listarContas(repo.db, phone, { hoje, incluirPagas: !!input.incluir_pagas });
      if (!contas.length) return "Nenhuma conta a pagar cadastrada.";
      return contas.map((c) => `${describeConta(c)}${c.status === "paga" ? " | PAGA" : c.vencida ? " | VENCIDA" : ""}`).join("\n");
    }

    case "pagar_conta": {
      const r = pagarConta(repo, ctx, input.id, { valor: input.valor, data: input.data, pagamento: input.forma_pagamento });
      const depois = r.conta.status === "paga" ? "Conta quitada." : `Proximo vencimento: ${r.conta.due_on}.`;
      return `Pagamento registrado: ${describe(r.transacao)}. ${depois}`;
    }

    case "cancelar_conta_pagar": {
      const c = cancelarConta(repo.db, ctx, input.id);
      return `Conta a pagar #${c.id} ${c.description} removida. Nao aviso mais dela.`;
    }

    case "criar_recorrencia": {
      const r = criarRecorrencia(repo.db, ctx, {
        tipo: input.tipo,
        valor: input.valor,
        categoria: input.categoria,
        descricao: input.descricao,
        frequencia: input.frequencia,
        inicio: input.inicio,
        contraparte: input.contraparte,
        pagamento: input.forma_pagamento,
      });
      return `Recorrencia criada: ${describeRecorrencia(r)}. Lanco sozinho em cada data.`;
    }

    case "listar_recorrencias": {
      if (!pode(ctx, "despesas") && !pode(ctx, "receitas")) exigir(ctx, "despesas");
      const lista = listarRecorrencias(repo.db, ctx);
      return lista.length ? lista.map(describeRecorrencia).join("\n") : "Nenhuma recorrencia cadastrada.";
    }

    case "alterar_recorrencia": {
      const r = alterarRecorrencia(repo.db, ctx, input.id, input.acao ?? null, localDate(), input.valor);
      return r.status === "cancelada" ? `Recorrencia #${r.id} ${r.description} cancelada. Os lancamentos ja feitos continuam.` : `Atualizada: ${describeRecorrencia(r)}.`;
    }

    case "comparar_meses": {
      const c = compararMeses(repo, phone, input.mes ?? null, localDate());
      const diff = c.total - c.totalAnterior;
      const pctTotal = c.totalAnterior ? ` (${diff >= 0 ? "+" : ""}${Math.round((diff / c.totalAnterior) * 100)}%)` : "";
      const periodo = c.ateODia ? ` ate o dia ${c.ateODia}` : "";
      return [
        `Despesas de ${c.mes}${periodo}: ${brl(c.total)}. Mesmo periodo de ${c.mesAnterior}: ${brl(c.totalAnterior)}. Diferenca: ${diff >= 0 ? "+" : "-"}${brl(Math.abs(diff))}${pctTotal}.`,
        c.variacoes.length
          ? `Maiores variacoes: ${c.variacoes.map((v) => `${v.categoria} ${v.diferenca >= 0 ? "+" : "-"}${brl(Math.abs(v.diferenca))} (${brl(v.anterior)} para ${brl(v.atual)})`).join("; ")}.`
          : "Sem gastos nos dois periodos.",
      ].join("\n");
    }

    case "configurar_avisos": {
      const atual = preferencias(repo.db, ctx).find((p) => p.tipo === input.tipo)!;
      if (!atual.disponivel) return `O aviso de ${atual.nome.toLowerCase()} nao se aplica ao acesso de ${ctx.nome ?? "quem fala"} nesta conta.`;
      definirPreferencia(repo.db, ctx.membro, input.tipo, { ligado: input.ligado, hora: input.hora });
      const hora = input.hora ?? atual.hora;
      return input.ligado ? `${atual.nome} ligado, as ${hora}h.` : `${atual.nome} desligado.`;
    }

    case "mensagem_para_contato":
      return pedirEnvio(repo.db, ctx, {
        contato: input.contato,
        telefone: input.telefone,
        texto: input.texto,
        dataHora: input.data_hora,
        recorrencia: input.recorrencia,
        confirmado: input.confirmado,
      }, new Date()).texto;

    case "consultar_mensagens_contato": {
      const envios = listarEnvios(repo.db, ctx, input.contato);
      const mensagens = ultimasMensagens(repo.db, ctx, input.contato, 10);
      if (!envios.length && !mensagens.length) return "Nenhuma mensagem para outras pessoas.";
      return [
        envios.length
          ? `Envios ativos:\n${envios.map((e) => `#${e.id} | ${e.contato} | proximo ${e.next_run_at ? formatLocal(new Date(e.next_run_at)) : "-"}${e.recurrence ? ` | ${e.recurrence}` : ""} | "${e.text}"`).join("\n")}`
          : "Nenhum envio agendado.",
        mensagens.length
          ? `Ultimas mensagens:\n${mensagens.map((m) => `${formatLocal(new Date(m.sent_at))} | ${m.contato} | ${m.status}${m.error ? ` (${m.error})` : ""}${m.reply_text ? ` | respondeu: "${m.reply_text}"` : m.status === "pulada" ? "" : " | sem resposta"}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "cancelar_mensagem_contato": {
      const e = envioDaConta(repo.db, ctx, input.id);
      if (!input.confirmado) return `Confirme com o usuario antes de cancelar: #${e.id} para ${e.contato}, "${e.text}"${e.recurrence ? `, ${e.recurrence}` : ""}.`;
      cancelarEnvio(repo.db, ctx, input.id);
      return `Cancelado: nao mando mais "${e.text}" para ${e.contato}.`;
    }

    default:
      throw new Error(`${toolName} fala com o Google e e assincrona: use executarFerramenta.`);
  }
}

const hora = (iso: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const describeEvento = (e: Evento) =>
  `${e.id} | ${e.diaInteiro ? `${e.inicio} (dia inteiro)` : `${formatLocal(new Date(e.inicio))} a ${hora(e.fim)}`} | ${e.titulo}` +
  `${e.convidados.length ? ` | com ${e.convidados.join(", ")}` : ""}${e.linkVideo ? ` | ${e.linkVideo}` : ""}`;

const SITUACAO: Record<SituacaoAgendamento, string> = {
  reservando: "reservando",
  agendado: "agendado",
  confirmado: "confirmado pelo cliente",
  remarcando: "aguardando o cliente escolher novo horario",
  cancelado: "cancelado",
};
const describeAgendamento = (b: Agendamento) =>
  `#${b.id} | ${formatLocal(new Date(b.starts_at))} | ${b.client_name} | ${SITUACAO[b.status]}${b.confirmation_failed ? " (confirmacao nao enviada)" : ""}`;

/** Lembrete do WhatsApp que acompanha o compromisso; sem Google, e o unico registro dele. */
function lembreteDoCompromisso(repo: Repo, ctx: Contexto, titulo: string, inicio: Date, minutosAntes: number, eventId?: string) {
  const quando = new Date(inicio.getTime() - minutosAntes * 60_000);
  if (quando.getTime() < Date.now()) return null;
  return repo.addReminder(ctx.conta, `${titulo} as ${hora(inicio)}`, quando, null, {
    created_by: ctx.membro,
    notify_phone: ctx.membro,
    google_event_id: eventId ?? null,
  });
}

/** Explica a falha do Google para o modelo; conexao vencida ou ausente leva o link para resolver. */
function falhaGoogle(repo: Repo, ctx: Contexto, err: unknown): string {
  if (err instanceof GoogleNaoConfigurado) return err.message;
  if (err instanceof GoogleNaoConectado) return `Google Agenda nao conectada. Link para conectar (vale 15 min): ${criarLink(repo.db, ctx.membro)}`;
  if (err instanceof GoogleExpirado) return `O acesso ao Google Agenda venceu. Link para reconectar (vale 15 min): ${criarLink(repo.db, ctx.membro)}`;
  if (err instanceof GoogleIndisponivel) return err.message;
  throw err;
}

/** A agenda e de quem fala (ctx.membro), nunca do titular da conta. */
async function agendaGoogle(repo: Repo, ctx: Contexto, toolName: ToolName, input: any): Promise<string> {
  const db = repo.db;
  const quem = ctx.membro;
  switch (toolName) {
    case "conectar_google_agenda": {
      const e = estadoGoogle(db, quem);
      if (!e.configurado) return new GoogleNaoConfigurado().message;
      if (e.conectada) return `O Google Agenda ja esta conectado${e.email ? ` com ${e.email}` : ""}.`;
      return `Link para conectar o Google Agenda (vale 15 min, uso unico): ${criarLink(db, quem)}`;
    }

    case "criar_compromisso": {
      const inicio = fromLocal(input.inicio);
      if (inicio.getTime() < Date.now() - 60_000) return `Esse horario (${formatLocal(inicio)}) ja passou. Confirme a data com o usuario.`;
      const duracao = input.duracao_minutos ?? 60;
      const antes = input.lembrar_minutos_antes ?? 60;
      const fim = new Date(inicio.getTime() + duracao * 60_000);
      const aviso = antes ? ` Lembro ${antes} min antes pelo WhatsApp.` : "";
      try {
        const choques = await conflitos(db, quem, inicio, fim);
        if (choques.length && !input.confirmar_conflito) {
          const lista = choques.map((c) => `${c.titulo} (${formatLocal(new Date(c.inicio))} a ${hora(c.fim)})`).join("; ");
          return `Conflito com ${lista}. Pergunte se marca assim mesmo; se sim, chame de novo com confirmar_conflito true.`;
        }
        const ev = await criarEvento(db, quem, { titulo: input.titulo, inicio, duracaoMin: duracao, convidados: input.convidados ?? [], comVideo: !!input.com_videochamada });
        if (antes) lembreteDoCompromisso(repo, ctx, input.titulo, inicio, antes, ev.id);
        const extras = [ev.linkVideo && `Meet: ${ev.linkVideo}`, ev.convidados.length && `convite enviado para ${ev.convidados.join(", ")}`].filter(Boolean);
        return `Marcado no Google Agenda: ${ev.titulo}, ${formatLocal(inicio)} a ${hora(fim)}${extras.length ? `, ${extras.join(", ")}` : ""} (id ${ev.id}).${aviso}`;
      } catch (err) {
        const motivo = falhaGoogle(repo, ctx, err);
        const r = lembreteDoCompromisso(repo, ctx, input.titulo, inicio, antes);
        return `${motivo}\n${r ? `Criei o lembrete interno para ${formatLocal(new Date(r.next_run_at))}: ${r.text}.` : "Nao criei lembrete: o horario do aviso ja passou."}`;
      }
    }

    case "consultar_agenda": {
      try {
        const de = fromLocal(`${input.data_inicio}T00:00`);
        const ate = fromLocal(`${addDias(input.data_fim, 1)}T00:00`);
        const eventos = await listarEventos(db, quem, de, ate, input.busca);
        return eventos.length ? eventos.map(describeEvento).join("\n") : "Nenhum compromisso no periodo.";
      } catch (err) {
        return falhaGoogle(repo, ctx, err);
      }
    }

    case "remarcar_compromisso": {
      try {
        const r = await moverEvento(db, quem, input.id, fromLocal(input.novo_inicio), input.duracao_minutos);
        if (!r) return `Compromisso ${input.id} nao encontrado. Use consultar_agenda para achar o id.`;
        // O lembrete ligado mantem a mesma antecedencia em relacao ao compromisso.
        for (const l of repo.remindersDoEvento(ctx.conta, input.id)) {
          const antecedencia = new Date(r.antes.inicio).getTime() - new Date(l.next_run_at).getTime();
          repo.moverLembreteDoEvento(ctx.conta, input.id, new Date(new Date(r.depois.inicio).getTime() - antecedencia));
        }
        return `Remarcado. Os convidados sao avisados pelo Google.\nAntes: ${describeEvento(r.antes)}\nAgora: ${describeEvento(r.depois)}`;
      } catch (err) {
        return falhaGoogle(repo, ctx, err);
      }
    }

    case "cancelar_compromisso": {
      try {
        const e = await eventoGoogle(db, quem, input.id);
        if (!e) return `Compromisso ${input.id} nao encontrado. Use consultar_agenda para achar o id.`;
        if (!input.confirmado) return `Confirme com o usuario antes de apagar: ${describeEvento(e)}.`;
        await apagarEvento(db, quem, input.id);
        for (const l of repo.remindersDoEvento(ctx.conta, input.id)) repo.cancelReminder(ctx.conta, l.id);
        return `Cancelado: ${e.titulo}. Os convidados sao avisados pelo Google.`;
      } catch (err) {
        return falhaGoogle(repo, ctx, err);
      }
    }

    case "desconectar_google_agenda": {
      if (!input.confirmado) return "Confirme com o usuario: desligar o Google Agenda? Os compromissos continuam no Google, mas eu paro de ler e marcar.";
      return (await desconectarGoogle(db, quem)) ? "Desconectei o Google Agenda e apaguei o acesso guardado." : "O Google Agenda ja estava desconectado.";
    }

    case "link_de_agendamento": {
      const e = estadoGoogle(db, quem);
      if (!e.configurado) return new GoogleNaoConfigurado().message;
      if (!e.conectada) return `A pagina de agendamento precisa do Google Agenda. Link para conectar (vale 15 min): ${criarLink(db, quem)}`;
      const p = paginaDe(db, quem);
      if (!p) return `Ainda nao ha pagina de agendamento. Ative no painel, na mesa de Agenda: ${config.google.painelUrl}/agenda`;
      if (p.status === "pausada") return `A pagina de agendamento esta pausada. Reative no painel, na mesa de Agenda: ${config.google.painelUrl}/agenda`;
      return `Link da pagina de agendamento (${p.display_name}): ${linkDaPagina(p)}`;
    }

    case "consultar_agendamentos": {
      const alvo = input.cliente ? semAcento(input.cliente) : null;
      const lista = listarAgendamentos(db, ctx, fromLocal(`${input.data_inicio}T00:00`), fromLocal(`${addDias(input.data_fim, 1)}T00:00`)).filter(
        (b) => !alvo || semAcento(b.client_name).includes(alvo),
      );
      return lista.length ? lista.map(describeAgendamento).join("\n") : "Nenhum horario marcado por cliente no periodo.";
    }

    case "remarcar_agendamento": {
      try {
        const r = await remarcar(repo, ctx, input.id, new Date(), sendNotice);
        if (!r.opcoes.length) return `Nao ha horario livre nos proximos 14 dias para ${r.agendamento.client_name}. Nada foi enviado; o horario continua marcado.`;
        const opcoes = r.opcoes.map((o, i) => `${i + 1}) ${formatLocal(new Date(o.inicio))}`).join(" ");
        return r.enviado
          ? `Mandei para ${r.agendamento.client_name} as opcoes ${opcoes}. Quando o cliente escolher, mudo o evento e aviso.`
          : `Separei as opcoes ${opcoes}, mas a mensagem para ${r.agendamento.client_name} nao saiu (o cliente pediu para nao receber mensagens ou o WhatsApp recusou). Combine direto com o cliente.`;
      } catch (err) {
        return falhaGoogle(repo, ctx, err);
      }
    }

    case "cancelar_agendamento": {
      try {
        if (!input.confirmado) {
          const b = agendamentoDoDono(db, ctx, input.id);
          return `Confirme com o usuario antes de cancelar: ${describeAgendamento(b)}. O cliente recebe o aviso com o link para marcar outro.`;
        }
        const r = await cancelar(repo, ctx, input.id, sendNotice);
        return `Cancelado: ${r.agendamento.client_name}, ${formatLocal(new Date(r.agendamento.starts_at))}.${r.enviado ? " O cliente foi avisado." : " O aviso ao cliente nao saiu; avise por outro meio."}`;
      } catch (err) {
        return falhaGoogle(repo, ctx, err);
      }
    }
  }
  throw new Error(`Ferramenta desconhecida: ${toolName}`);
}
