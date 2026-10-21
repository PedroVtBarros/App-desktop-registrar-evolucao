import type Database from 'better-sqlite3'
import type { EntradaAtividade, RegistroDia } from '../core/metricas'
import type { Item } from '../shared/item'
import type { StatusRegistro } from '../shared/registro'
import type { ItemRepositorio } from './itens'

export interface AtividadeCarregada {
  item: Item
  entrada: EntradaAtividade
}

/**
 * Carrega, em poucas consultas (nunca uma por dia), tudo que as métricas e as
 * visualizações precisam: programações, registros e descansos. Somente leitura.
 * Com `itemId`, restringe a uma atividade; sem ele, devolve todas (inclusive arquivadas).
 */
export function carregarAtividades(
  db: Database.Database,
  itens: ItemRepositorio,
  itemId?: number
): AtividadeCarregada[] {
  const lista = itemId === undefined ? itens.listar(true) : [itens.obter(itemId)]
  if (lista.length === 0) return []

  const filtro = itemId === undefined ? '' : ' WHERE item_id = ?'
  const args = itemId === undefined ? [] : [itemId]

  const registros = new Map<number, Map<string, RegistroDia>>()
  const linhasRegistro = db
    .prepare(`SELECT item_id, data, status, valor_realizado FROM registro${filtro}`)
    .all(...args) as {
    item_id: number
    data: string
    status: StatusRegistro
    valor_realizado: number | null
  }[]
  for (const l of linhasRegistro) {
    const porData = registros.get(l.item_id) ?? new Map<string, RegistroDia>()
    porData.set(l.data, { status: l.status, valor: l.valor_realizado })
    registros.set(l.item_id, porData)
  }

  const descansos = new Map<number, Set<string>>()
  const linhasDescanso = db
    .prepare(`SELECT item_id, data FROM descanso_data${filtro}`)
    .all(...args) as { item_id: number; data: string }[]
  for (const l of linhasDescanso) {
    const datas = descansos.get(l.item_id) ?? new Set<string>()
    datas.add(l.data)
    descansos.set(l.item_id, datas)
  }

  return lista.map((item) => ({
    item,
    entrada: {
      criadoEm: item.criadoEm,
      arquivadoEm: item.arquivadoEm,
      programacoes: itens.listarProgramacoes(item.id),
      registros: registros.get(item.id) ?? new Map(),
      descansos: descansos.get(item.id) ?? new Set()
    }
  }))
}
