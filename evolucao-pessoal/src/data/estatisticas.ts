import type Database from 'better-sqlite3'
import { hojeIso } from '../core/datas'
import { agregarGeral, calcularAtividade, type ResultadoAtividade } from '../core/metricas'
import type { Estatisticas, MetricasAtividade, PeriodoEstatisticas } from '../shared/estatisticas'
import { carregarAtividades } from './entradas'
import type { ItemRepositorio } from './itens'

/**
 * Lê itens, programações, registros e descansos e calcula as métricas na hora
 * (core/metricas). Somente leitura: nenhum resultado derivado é gravado.
 */
export class EstatisticasRepositorio {
  constructor(
    private readonly db: Database.Database,
    private readonly itens: ItemRepositorio,
    private readonly hoje: () => string = () => hojeIso()
  ) {}

  obter(periodo: PeriodoEstatisticas): Estatisticas {
    const hoje = this.hoje()
    const atividades: MetricasAtividade[] = []
    const resultados: ResultadoAtividade[] = []

    for (const { item, entrada } of carregarAtividades(this.db, this.itens)) {
      const r = calcularAtividade(entrada, hoje, periodo)
      // Arquivada só aparece enquanto tem dias elegíveis no período.
      if (item.arquivadoEm !== null && r.janela === null) continue
      resultados.push(r)
      atividades.push({
        itemId: item.id,
        nome: item.nome,
        tipo: item.tipo,
        categoria: item.categoria,
        unidade: item.unidade,
        arquivada: item.arquivadoEm !== null,
        ...r
      })
    }

    return { periodo, hoje, geral: agregarGeral(resultados), atividades }
  }
}
