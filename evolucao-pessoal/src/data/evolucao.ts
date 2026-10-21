import type Database from 'better-sqlite3'
import { hojeIso } from '../core/datas'
import { compararBlocos, serieDias, serieDoPeriodo } from '../core/evolucao'
import { agregarGeral, calcularAtividade } from '../core/metricas'
import {
  MAX_DIAS_GRAFICO,
  MAX_MESES,
  MAX_SEMANAS,
  type ConsultaEvolucao,
  type DiaSerie,
  type Evolucao
} from '../shared/evolucao'
import { carregarAtividades } from './entradas'
import type { ItemRepositorio } from './itens'

function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${mes}-${String(ultimo).padStart(2, '0')}`
}

/**
 * Dados do calendário, do gráfico de quantidade e dos comparativos semanais/mensais.
 * Uma chamada carrega tudo com poucas consultas (nenhuma por dia) e reutiliza
 * `classificarDia`/`acumularDia` da etapa 5, então os números coincidem com as estatísticas.
 */
export class EvolucaoRepositorio {
  constructor(
    private readonly db: Database.Database,
    private readonly itens: ItemRepositorio,
    private readonly hoje: () => string = () => hojeIso()
  ) {}

  obter(consulta: ConsultaEvolucao): Evolucao {
    const hoje = this.hoje()
    const { itemId, mes, periodo } = consulta
    const atividades = carregarAtividades(this.db, this.itens, itemId ?? undefined)

    // Séries do período (dias elegíveis, até ontem) de cada atividade considerada.
    const series: DiaSerie[][] = atividades.map(({ entrada }) => serieDoPeriodo(entrada, hoje, periodo))
    const resultados = atividades.map(({ entrada }) => calcularAtividade(entrada, hoje, periodo))

    let semanas = compararBlocos(series, 'semana')
    let meses = compararBlocos(series, 'mes')
    const semanasTruncado = semanas.length > MAX_SEMANAS
    const mesesTruncado = meses.length > MAX_MESES
    if (semanasTruncado) semanas = semanas.slice(-MAX_SEMANAS)
    if (mesesTruncado) meses = meses.slice(-MAX_MESES)

    const unica = atividades.length === 1 && itemId !== null ? atividades[0] : undefined
    const r = resultados[0]
    let resumo: Evolucao['resumo']
    if (unica && r) {
      resumo = {
        consistencia: r.consistencia,
        cumprimento: r.cumprimento,
        contagens: r.contagens,
        quantidadeTotal: r.quantidadeTotal,
        janela: r.janela
      }
    } else {
      const g = agregarGeral(resultados)
      resumo = {
        consistencia: g.consistencia,
        cumprimento: g.cumprimento,
        contagens: g.contagens,
        quantidadeTotal: null, // unidades diferentes nunca são somadas
        janela: null
      }
    }

    let calendario: DiaSerie[] | null = null
    let grafico: Evolucao['grafico'] = null
    if (unica) {
      calendario = serieDias(unica.entrada, hoje, `${mes}-01`, ultimoDiaDoMes(mes))
      const completa = series[0] ?? []
      const truncado = completa.length > MAX_DIAS_GRAFICO
      grafico = {
        unidade: unica.item.unidade,
        dias: truncado ? completa.slice(-MAX_DIAS_GRAFICO) : completa,
        truncado
      }
    }

    return {
      hoje,
      consulta,
      resumo,
      calendario,
      grafico,
      semanas,
      semanasTruncado,
      meses,
      mesesTruncado
    }
  }
}
