import type Database from 'better-sqlite3'
import { resumirAvaliacoes } from '../core/avaliacao'
import { dataIsoValida, hojeIso } from '../core/datas'
import { ErroDominio } from '../core/erros'
import type {
  Avaliacao,
  HabilidadeAvaliada,
  HistoricoHabilidade,
  NovaAvaliacao
} from '../shared/avaliacao'
import type { Item } from '../shared/item'
import type { ItemRepositorio } from './itens'

interface LinhaAvaliacao {
  id: number
  item_id: number
  data: string
  nota: number
  observacao: string | null
  atualizado_em: string
}

const COLUNAS = 'id, item_id, data, nota, observacao, atualizado_em'

function paraAvaliacao(l: LinhaAvaliacao): Avaliacao {
  return {
    id: l.id,
    itemId: l.item_id,
    data: l.data,
    nota: l.nota,
    observacao: l.observacao,
    atualizadoEm: l.atualizado_em
  }
}

function formatar(dataIso: string): string {
  const [a, m, d] = dataIso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Autoavaliação manual de habilidades. Tabela própria: nada aqui é calculado a partir de
 * registros, metas ou métricas, e nenhuma escrita em `avaliacao` toca outras tabelas.
 */
export class AvaliacaoRepositorio {
  constructor(
    private readonly db: Database.Database,
    private readonly itens: ItemRepositorio,
    private readonly hoje: () => string = () => hojeIso(),
    private readonly agora: () => string = () => new Date().toISOString()
  ) {}

  /** Todas as habilidades (inclusive arquivadas) com última nota e variação. Hábitos ficam de fora. */
  resumoHabilidades(): HabilidadeAvaliada[] {
    const porItem = new Map<number, Avaliacao[]>()
    const linhas = this.db
      .prepare(`SELECT ${COLUNAS} FROM avaliacao ORDER BY data`)
      .all() as LinhaAvaliacao[]
    for (const l of linhas) {
      const lista = porItem.get(l.item_id) ?? []
      lista.push(paraAvaliacao(l))
      porItem.set(l.item_id, lista)
    }
    return this.itens
      .listar(true)
      .filter((i) => i.tipo === 'habilidade')
      .map((i) => ({
        itemId: i.id,
        nome: i.nome,
        categoria: i.categoria,
        arquivada: i.arquivadoEm !== null,
        criadoEm: i.criadoEm,
        ...resumirAvaliacoes(porItem.get(i.id) ?? [])
      }))
  }

  /** Histórico cronológico de uma habilidade (arquivada também: apenas consulta). */
  historico(itemId: number): HistoricoHabilidade {
    const item = this.habilidade(itemId)
    const avaliacoes = (
      this.db
        .prepare(`SELECT ${COLUNAS} FROM avaliacao WHERE item_id = ? ORDER BY data`)
        .all(itemId) as LinhaAvaliacao[]
    ).map(paraAvaliacao)
    return {
      habilidade: {
        itemId: item.id,
        nome: item.nome,
        categoria: item.categoria,
        arquivada: item.arquivadoEm !== null,
        criadoEm: item.criadoEm
      },
      avaliacoes,
      resumo: resumirAvaliacoes(avaliacoes)
    }
  }

  /** Cria ou substitui a avaliação da data (no máximo uma por habilidade e data). */
  salvar(itemId: number, data: string, nova: NovaAvaliacao): Avaliacao {
    const item = this.habilidadeEditavel(itemId)
    if (!dataIsoValida(data)) throw new ErroDominio('Data inválida.', 'data')
    if (data > this.hoje()) {
      throw new ErroDominio('Não é possível avaliar em uma data futura.', 'data')
    }
    if (data < item.criadoEm) {
      throw new ErroDominio(
        `Esta habilidade só existe a partir de ${formatar(item.criadoEm)}.`,
        'data'
      )
    }
    const agora = this.agora()
    this.db
      .prepare(
        `INSERT INTO avaliacao (item_id, data, nota, observacao, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (item_id, data) DO UPDATE SET
           nota = excluded.nota,
           observacao = excluded.observacao,
           atualizado_em = excluded.atualizado_em`
      )
      .run(itemId, data, nova.nota, nova.observacao, agora, agora)
    const l = this.db
      .prepare(`SELECT ${COLUNAS} FROM avaliacao WHERE item_id = ? AND data = ?`)
      .get(itemId, data) as LinhaAvaliacao
    return paraAvaliacao(l)
  }

  /** Remove a avaliação da data. Idempotente; a confirmação é responsabilidade da interface. */
  remover(itemId: number, data: string): void {
    this.habilidadeEditavel(itemId)
    this.db.prepare('DELETE FROM avaliacao WHERE item_id = ? AND data = ?').run(itemId, data)
  }

  private habilidade(itemId: number): Item {
    const item = this.itens.obter(itemId)
    if (item.tipo !== 'habilidade') {
      throw new ErroDominio('A autoavaliação é só para habilidades, não para hábitos.')
    }
    return item
  }

  private habilidadeEditavel(itemId: number): Item {
    const item = this.habilidade(itemId)
    if (item.arquivadoEm !== null) {
      throw new ErroDominio('Habilidade arquivada: apenas consulta. Desarquive-a para avaliar.')
    }
    return item
  }
}
