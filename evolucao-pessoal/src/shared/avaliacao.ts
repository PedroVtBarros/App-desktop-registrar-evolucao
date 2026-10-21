/** Autoavaliação de habilidades: tipos compartilhados entre main, preload e renderer. */

export const NOTA_MIN = 0
export const NOTA_MAX = 10
export const LIMITE_OBSERVACAO_AVALIACAO = 500

export interface Avaliacao {
  id: number
  itemId: number
  /** Data AAAA-MM-DD da avaliação. */
  data: string
  /** Inteira de 0 a 10, escolhida manualmente. Nunca é calculada. */
  nota: number
  observacao: string | null
  atualizadoEm: string
}

export interface NovaAvaliacao {
  nota: number
  observacao: string | null
}

export interface ResumoAvaliacao {
  /** Avaliação mais recente (por data); null = nunca avaliada. */
  ultima: Avaliacao | null
  /** Avaliação imediatamente anterior à última. */
  anterior: Avaliacao | null
  /** última − anterior; positivo = subiu, negativo = desceu, 0 = igual; null = sem anterior. */
  variacao: number | null
  total: number
}

export interface HabilidadeAvaliada extends ResumoAvaliacao {
  itemId: number
  nome: string
  categoria: string | null
  arquivada: boolean
  criadoEm: string
}

export interface HistoricoHabilidade {
  habilidade: {
    itemId: number
    nome: string
    categoria: string | null
    arquivada: boolean
    criadoEm: string
  }
  /** Em ordem cronológica (da mais antiga para a mais recente). */
  avaliacoes: Avaliacao[]
  resumo: ResumoAvaliacao
}
