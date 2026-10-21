import type { Avaliacao, ResumoAvaliacao } from '../shared/avaliacao'

/**
 * Resume uma lista de avaliações (qualquer ordem). Só lê as notas que o usuário
 * registrou: não cria avaliações para datas sem registro e não usa prática alguma.
 */
export function resumirAvaliacoes(avaliacoes: readonly Avaliacao[]): ResumoAvaliacao {
  const ordenadas = [...avaliacoes].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
  const ultima = ordenadas.at(-1) ?? null
  const anterior = ordenadas.length >= 2 ? (ordenadas.at(-2) ?? null) : null
  return {
    ultima,
    anterior,
    variacao: ultima && anterior ? ultima.nota - anterior.nota : null,
    total: ordenadas.length
  }
}
