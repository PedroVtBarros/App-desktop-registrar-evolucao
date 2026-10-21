/** Tipos do registro diário, compartilhados entre main, preload e renderer. */
import type { MetaDia, TipoItem } from './item'

/**
 * Situação escolhida pelo usuário. Nunca é deduzida da quantidade realizada.
 * "Pendente"/"sem registro" não são status: são a ausência de registro no dia.
 */
export const STATUS_REGISTRO = ['concluido', 'parcial', 'nao_realizado'] as const
export type StatusRegistro = (typeof STATUS_REGISTRO)[number]

export interface Registro {
  id: number
  itemId: number
  /** Data AAAA-MM-DD do dia registrado. */
  data: string
  status: StatusRegistro
  /** Quantidade realmente executada (pode ser menor, igual ou maior que a meta); null = não informada. */
  valorRealizado: number | null
  /** Meta vigente quando o registro foi criado; null = era dia de descanso. Nunca muda depois. */
  metaNoDia: number | null
  observacao: string | null
  atualizadoEm: string
}

export interface NovoRegistro {
  status: StatusRegistro
  valorRealizado: number | null
  observacao: string | null
}

/**
 * Como o dia de uma atividade aparece:
 * - registrado: há registro (com o status escolhido pelo usuário)
 * - descanso: descanso da programação semanal ou excepcional (sem registro)
 * - pendente: hoje, ainda sem registro
 * - sem_registro: dia passado sem registro (não é "não realizado")
 * - futuro: data ainda não chegou (nunca conta como falha)
 */
export type SituacaoDia = 'registrado' | 'descanso' | 'pendente' | 'sem_registro' | 'futuro'

export interface DescansoExcepcional {
  motivo: string | null
}

export interface AtividadeDia {
  itemId: number
  tipo: TipoItem
  nome: string
  categoria: string | null
  unidade: string
  /** Atividade arquivada: apenas consulta. */
  arquivada: boolean
  /** Meta efetiva da data (programação vigente nela); null = descanso (programado ou excepcional). */
  meta: MetaDia
  /** Meta da programação semanal vigente na data, ignorando descanso excepcional. */
  metaProgramada: MetaDia
  descansoExcepcional: DescansoExcepcional | null
  registro: Registro | null
  situacao: SituacaoDia
}

export interface DiaRegistro {
  data: string
  /** Data de hoje segundo o processo principal. */
  hoje: string
  atividades: AtividadeDia[]
}

export const LIMITE_OBSERVACAO = 500
export const LIMITE_MOTIVO = 100
/** Descanso pode ser agendado até este número de dias à frente. */
export const LIMITE_DIAS_FUTUROS = 366
