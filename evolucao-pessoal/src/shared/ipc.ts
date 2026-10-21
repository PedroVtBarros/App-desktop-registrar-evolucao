/** Contrato IPC entre renderer e main. Único ponto que define canais e tipos. */
import type {
  AnaliseImportacao,
  Cancelavel,
  EscolhaImportacao,
  InfoDados,
  PreviaRestauracao,
  ResultadoBackup,
  ResultadoImportacao,
  ResultadoRestauracao
} from './dados'
import type {
  Avaliacao,
  HabilidadeAvaliada,
  HistoricoHabilidade,
  NovaAvaliacao
} from './avaliacao'
import type { Estatisticas, PeriodoEstatisticas } from './estatisticas'
import type { ConsultaEvolucao, Evolucao } from './evolucao'
import type { EdicaoItem, Item, MetaDia, NovoItem, Resultado } from './item'
import type { AtividadeDia, DiaRegistro, NovoRegistro } from './registro'

export const IPC = {
  ping: 'app:ping',
  itensListar: 'itens:listar',
  itensCriar: 'itens:criar',
  itensEditar: 'itens:editar',
  itensDefinirProgramacao: 'itens:definirProgramacao',
  itensArquivar: 'itens:arquivar',
  itensDesarquivar: 'itens:desarquivar',
  itensExcluir: 'itens:excluir',
  diaObter: 'dia:obter',
  diaRegistrar: 'dia:registrar',
  diaLimpar: 'dia:limpar',
  diaDefinirDescanso: 'dia:definirDescanso',
  diaRemoverDescanso: 'dia:removerDescanso',
  estatisticasObter: 'estatisticas:obter',
  evolucaoObter: 'evolucao:obter',
  avaliacoesResumo: 'avaliacoes:resumo',
  avaliacoesHistorico: 'avaliacoes:historico',
  avaliacoesSalvar: 'avaliacoes:salvar',
  avaliacoesRemover: 'avaliacoes:remover',
  dadosInfo: 'dados:info',
  dadosCriarBackup: 'dados:criarBackup',
  dadosEscolherRestauracao: 'dados:escolherRestauracao',
  dadosConfirmarRestauracao: 'dados:confirmarRestauracao',
  dadosAnalisarImportacao: 'dados:analisarImportacao',
  dadosImportar: 'dados:importar'
} as const

export interface PingResultado {
  ok: true
  versao: string
  pastaDados: string
}

export interface ApiItens {
  listar(incluirArquivados: boolean): Promise<Resultado<Item[]>>
  criar(novo: NovoItem): Promise<Resultado<Item>>
  editar(id: number, dados: EdicaoItem): Promise<Resultado<Item>>
  /** Define a programação semanal (7 metas; null = descanso) a partir de `vigenteDe` (hoje ou futuro). */
  definirProgramacao(id: number, metas: MetaDia[], vigenteDe: string): Promise<Resultado<Item>>
  arquivar(id: number): Promise<Resultado<Item>>
  desarquivar(id: number): Promise<Resultado<Item>>
  excluir(id: number): Promise<Resultado<null>>
}

/** Registro por data (AAAA-MM-DD). Datas futuras não aceitam registro, apenas descanso. */
export interface ApiDia {
  /** `data` null = hoje (conforme o processo principal). */
  obter(data: string | null): Promise<Resultado<DiaRegistro>>
  registrar(itemId: number, data: string, registro: NovoRegistro): Promise<Resultado<AtividadeDia>>
  /** Remove o registro da data (volta a pendente / sem registro). */
  limpar(itemId: number, data: string): Promise<Resultado<AtividadeDia>>
  /** Descanso excepcional na data, sem alterar a programação semanal. */
  definirDescanso(
    itemId: number,
    data: string,
    motivo: string | null
  ): Promise<Resultado<AtividadeDia>>
  removerDescanso(itemId: number, data: string): Promise<Resultado<AtividadeDia>>
}

/** Métricas derivadas (somente leitura). */
export interface ApiEstatisticas {
  obter(periodo: PeriodoEstatisticas): Promise<Resultado<Estatisticas>>
}

/** Calendário, gráficos e comparativos (somente leitura). */
export interface ApiVisualizacoes {
  obter(consulta: ConsultaEvolucao): Promise<Resultado<Evolucao>>
}

/** Autoavaliação manual (0–10) de habilidades. Independente de registros e métricas. */
export interface ApiAvaliacoes {
  resumo(): Promise<Resultado<HabilidadeAvaliada[]>>
  historico(itemId: number): Promise<Resultado<HistoricoHabilidade>>
  /** Cria ou substitui a avaliação da data (uma por habilidade e data). */
  salvar(itemId: number, data: string, avaliacao: NovaAvaliacao): Promise<Resultado<Avaliacao>>
  remover(itemId: number, data: string): Promise<Resultado<null>>
}

/**
 * Backup, restauração e importação. Os caminhos de arquivo nunca passam pelo renderer:
 * os diálogos nativos abrem no processo principal e as confirmações usam tokens.
 */
export interface ApiDados {
  info(): Promise<Resultado<InfoDados>>
  criarBackup(): Promise<Resultado<Cancelavel<ResultadoBackup>>>
  escolherRestauracao(): Promise<Resultado<Cancelavel<PreviaRestauracao>>>
  /** Substitui os dados atuais pelo backup da prévia e reinicia o aplicativo. */
  confirmarRestauracao(token: string): Promise<Resultado<ResultadoRestauracao>>
  analisarImportacao(): Promise<Resultado<Cancelavel<AnaliseImportacao>>>
  importar(token: string, escolhas: EscolhaImportacao[]): Promise<Resultado<ResultadoImportacao>>
}

export interface ApiEvolucao {
  ping(): Promise<PingResultado>
  itens: ApiItens
  dia: ApiDia
  estatisticas: ApiEstatisticas
  evolucao: ApiVisualizacoes
  avaliacoes: ApiAvaliacoes
  dados: ApiDados
}
