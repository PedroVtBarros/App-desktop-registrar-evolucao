/** Tipos das visualizações (calendário e gráficos). Tudo derivado na leitura; nada é gravado. */
import type { Contagens, PeriodoEstatisticas } from './estatisticas'
import type { StatusRegistro } from './registro'

/**
 * Estado de um dia de uma atividade:
 * - concluido / parcial / nao_realizado: registro com o status escolhido pelo usuário
 * - sem_registro: dia passado previsto sem registro (falha nas métricas; nada é gravado)
 * - descanso: descanso semanal ou excepcional (com ou sem prática)
 * - pendente: hoje, ainda sem registro
 * - futuro: data posterior a hoje
 * - antes_criacao: data anterior à criação da atividade
 * - arquivada: a partir da data de arquivamento (não conta nas métricas)
 */
export type EstadoDia =
  | 'concluido'
  | 'parcial'
  | 'nao_realizado'
  | 'sem_registro'
  | 'descanso'
  | 'pendente'
  | 'futuro'
  | 'antes_criacao'
  | 'arquivada'

export interface DiaSerie {
  data: string
  estado: EstadoDia
  /** É o dia de hoje (nunca entra em consistência/cumprimento). */
  hoje: boolean
  /** Meta efetiva da data (programação histórica); null = descanso ou sem programação. */
  meta: number | null
  /** Status do registro, se existir (inclusive em dia de descanso). */
  status: StatusRegistro | null
  /** Quantidade informada; null = não informada (diferente de 0, que é uma quantidade). */
  quantidade: number | null
  /** Descanso (semanal ou excepcional) com prática concluída/parcial registrada. */
  praticaEmDescanso: boolean
  /** O descanso do dia é excepcional (e não da programação semanal). */
  descansoExcepcional: boolean
}

export type GranularidadeComparativo = 'semana' | 'mes'

/** Consistência de um bloco (semana segunda–domingo ou mês), com as mesmas regras da etapa 5. */
export interface Comparativo {
  /** Segunda-feira da semana (AAAA-MM-DD) ou o mês (AAAA-MM). */
  chave: string
  /** Limites nominais do bloco (AAAA-MM-DD). */
  inicio: string
  fim: string
  /** Dias do bloco que entraram nas métricas (passados, previstos ou descanso). */
  diasContados: number
  contagens: Contagens
  diasComPratica: number
  consistencia: number | null
  cumprimento: number | null
}

export interface ConsultaEvolucao {
  /** null = todas as atividades (apenas comparativos de consistência). */
  itemId: number | null
  /** Mês do calendário, AAAA-MM. */
  mes: string
  periodo: PeriodoEstatisticas
}

export interface GraficoQuantidade {
  unidade: string
  /** Dias passados da janela (até ontem), do mais antigo ao mais recente. */
  dias: DiaSerie[]
  /** Há dias mais antigos na janela que não foram plotados. */
  truncado: boolean
}

export interface Evolucao {
  hoje: string
  consulta: ConsultaEvolucao
  /** Resumo da etapa 5 para a mesma janela (mesma fonte dos percentuais). */
  resumo: {
    consistencia: number | null
    cumprimento: number | null
    contagens: Contagens
    quantidadeTotal: number | null
    janela: { inicio: string; fim: string } | null
  }
  /** Dias do mês consultado; null quando "todas as atividades". */
  calendario: DiaSerie[] | null
  grafico: GraficoQuantidade | null
  semanas: Comparativo[]
  semanasTruncado: boolean
  meses: Comparativo[]
  mesesTruncado: boolean
}

export const MAX_DIAS_GRAFICO = 180
export const MAX_SEMANAS = 26
export const MAX_MESES = 24
