/** Tipos das estatísticas, compartilhados entre main, preload e renderer. Tudo é derivado, nada é gravado. */
import type { TipoItem } from './item'

export const PERIODOS = ['7d', '30d', '90d', 'completo'] as const
export type PeriodoEstatisticas = (typeof PERIODOS)[number]

/** Contagem de dias de uma atividade na janela considerada (dias passados, de criação até ontem). */
export interface Contagens {
  /** Dias com meta (não são descanso): o denominador de consistência e cumprimento. */
  previstos: number
  concluidos: number
  parciais: number
  /** Status "Não realizada" registrado pelo usuário. */
  naoRealizados: number
  /** Dia previsto, já terminado, sem registro (conta como falha; nada é gravado). */
  semRegistro: number
  /** Descanso semanal ou excepcional (fora do denominador). */
  descansos: number
  /** Dias de descanso em que houve prática concluída/parcial (informativo; fora do denominador). */
  praticaEmDescanso: number
}

export interface MetricasAtividade {
  itemId: number
  nome: string
  tipo: TipoItem
  categoria: string | null
  unidade: string
  arquivada: boolean
  /** Janela efetivamente considerada para esta atividade; null = nenhum dia elegível. */
  janela: { inicio: string; fim: string } | null
  contagens: Contagens
  /** Concluída + parcial entre os dias previstos. */
  diasComPratica: number
  /** 0–100; null = sem dias previstos ("Sem dados"). */
  consistencia: number | null
  cumprimento: number | null
  /** Soma das quantidades registradas na janela, na unidade da própria atividade. */
  quantidadeTotal: number
  diasComQuantidade: number
  /** Calculadas sobre todo o histórico, independentemente do período escolhido. */
  sequenciaAtual: number
  maiorSequencia: number
}

export interface MetricasGerais {
  /** Atividades com ao menos um dia previsto na janela. */
  atividadesComDados: number
  contagens: Contagens
  diasComPratica: number
  consistencia: number | null
  cumprimento: number | null
}

export interface Estatisticas {
  periodo: PeriodoEstatisticas
  /** Data local de hoje; hoje e o futuro nunca entram em consistência e cumprimento. */
  hoje: string
  geral: MetricasGerais
  atividades: MetricasAtividade[]
}
