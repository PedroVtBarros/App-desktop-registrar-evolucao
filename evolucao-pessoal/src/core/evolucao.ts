import type { PeriodoEstatisticas } from '../shared/estatisticas'
import type { Comparativo, DiaSerie, GranularidadeComparativo } from '../shared/evolucao'
import { somarDias } from './datas'
import {
  acumularDia,
  classificarDia,
  contagensVazias,
  janelaDoPeriodo,
  type EntradaAtividade
} from './metricas'
import { indiceDiaSemana } from './programacao'

/** Dias de `inicio` a `fim` (inclusive), cada um classificado pela regra única da etapa 5. */
export function serieDias(
  e: EntradaAtividade,
  hoje: string,
  inicio: string,
  fim: string
): DiaSerie[] {
  const dias: DiaSerie[] = []
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(classificarDia(e, d, hoje))
  return dias
}

/** Série dos dias elegíveis do período (mesma janela das estatísticas); vazia se não houver. */
export function serieDoPeriodo(
  e: EntradaAtividade,
  hoje: string,
  periodo: PeriodoEstatisticas
): DiaSerie[] {
  const janela = janelaDoPeriodo(e, hoje, periodo)
  return janela ? serieDias(e, hoje, janela.inicio, janela.fim) : []
}

function limitesDoBloco(
  data: string,
  tipo: GranularidadeComparativo
): { chave: string; inicio: string; fim: string } {
  if (tipo === 'semana') {
    const segunda = somarDias(data, -indiceDiaSemana(data))
    return { chave: segunda, inicio: segunda, fim: somarDias(segunda, 6) }
  }
  const [a, m] = data.split('-').map(Number) as [number, number]
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { chave: `${a}-${mm}`, inicio: `${a}-${mm}-01`, fim: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/**
 * Agrupa dias (de uma ou mais atividades) em semanas (segunda a domingo) ou meses e
 * calcula consistência/cumprimento por bloco com a mesma regra da etapa 5
 * (`acumularDia`). Retorna em ordem cronológica; blocos sem dias contados são omitidos.
 */
export function compararBlocos(
  series: readonly (readonly DiaSerie[])[],
  tipo: GranularidadeComparativo
): Comparativo[] {
  const blocos = new Map<string, Comparativo>()
  for (const serie of series) {
    for (const d of serie) {
      const limites = limitesDoBloco(d.data, tipo)
      let b = blocos.get(limites.chave)
      if (!b) {
        b = {
          ...limites,
          diasContados: 0,
          contagens: contagensVazias(),
          diasComPratica: 0,
          consistencia: null,
          cumprimento: null
        }
        blocos.set(limites.chave, b)
      }
      if (acumularDia(b.contagens, d)) b.diasContados += 1
    }
  }
  const lista = [...blocos.values()].filter((b) => b.diasContados > 0)
  for (const b of lista) {
    b.diasComPratica = b.contagens.concluidos + b.contagens.parciais
    const p = b.contagens.previstos
    b.consistencia = p === 0 ? null : (b.diasComPratica / p) * 100
    b.cumprimento = p === 0 ? null : (b.contagens.concluidos / p) * 100
  }
  return lista.sort((a, b) => (a.chave < b.chave ? -1 : 1))
}
