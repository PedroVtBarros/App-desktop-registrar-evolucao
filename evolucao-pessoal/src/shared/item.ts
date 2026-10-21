/** Tipos de domínio compartilhados entre main, preload e renderer. */

export const TIPOS_ITEM = ['habito', 'habilidade'] as const
export type TipoItem = (typeof TIPOS_ITEM)[number]

export const DIAS_NA_SEMANA = 7

/**
 * Meta de um dia da semana: número positivo, ou `null` = dia de descanso planejado
 * (sem meta). Descanso não é o mesmo que "não realizado", que é um status de registro.
 */
export type MetaDia = number | null

/**
 * Programação semanal que passa a valer em `vigenteDe` (AAAA-MM-DD).
 * `metas[0]` = segunda-feira … `metas[6]` = domingo.
 */
export interface Programacao {
  vigenteDe: string
  metas: MetaDia[]
}

export interface NovoItem {
  tipo: TipoItem
  nome: string
  categoria: string | null
  unidade: string
  /** Programação semanal inicial (7 posições), válida a partir de hoje. */
  metas: MetaDia[]
}

/** O tipo não muda depois de criado. */
export interface EdicaoItem {
  nome: string
  categoria: string | null
  unidade: string
}

export interface Item {
  id: number
  tipo: TipoItem
  nome: string
  categoria: string | null
  unidade: string
  criadoEm: string
  arquivadoEm: string | null
  /** Possui registros diários: não pode ser excluído nem trocar de unidade. */
  temHistorico: boolean
  /** Habilidade com autoavaliações: não pode ser excluída (só arquivada). */
  temAvaliacoes: boolean
  /** Programação em vigor hoje. */
  programacaoAtual: Programacao
  /** Mudanças de programação já agendadas para datas futuras, em ordem. */
  programacoesFuturas: Programacao[]
}

export interface ErroApi {
  campo?: string
  mensagem: string
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroApi }

export const LIMITES = {
  nome: 80,
  categoria: 40,
  unidade: 20,
  metaMaxima: 1_000_000
} as const
