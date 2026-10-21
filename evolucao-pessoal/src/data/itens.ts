import type Database from 'better-sqlite3'
import { hojeIso } from '../core/datas'
import { ErroDominio } from '../core/erros'
import {
  DIAS_NA_SEMANA,
  type EdicaoItem,
  type Item,
  type MetaDia,
  type NovoItem,
  type Programacao,
  type TipoItem
} from '../shared/item'

interface LinhaItem {
  id: number
  tipo: TipoItem
  nome: string
  categoria: string | null
  unidade: string
  criado_em: string
  arquivado_em: string | null
}

interface LinhaProgramacao {
  item_id: number
  vigente_de: string
  dia_semana: number
  valor_alvo: number | null
}

function ehUnicidade(erro: unknown): boolean {
  return (
    erro instanceof Error &&
    (erro as Error & { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
}

const MSG_NOME_REPETIDO = 'Já existe um item ativo com este nome.'

/** Agrupa linhas (ordenadas por vigente_de, dia_semana) em programações por item. */
function agrupar(linhas: LinhaProgramacao[]): Map<number, Programacao[]> {
  const porItem = new Map<number, Programacao[]>()
  for (const l of linhas) {
    const lista = porItem.get(l.item_id) ?? []
    let prog = lista.at(-1)
    if (!prog || prog.vigenteDe !== l.vigente_de) {
      prog = { vigenteDe: l.vigente_de, metas: new Array<MetaDia>(DIAS_NA_SEMANA).fill(null) }
      lista.push(prog)
    }
    prog.metas[l.dia_semana - 1] = l.valor_alvo
    porItem.set(l.item_id, lista)
  }
  return porItem
}

/**
 * Persistência de hábitos/habilidades. Recebe dados já validados (core/validacao)
 * e usa apenas consultas parametrizadas.
 */
export class ItemRepositorio {
  constructor(
    private readonly db: Database.Database,
    private readonly hoje: () => string = () => hojeIso()
  ) {}

  listar(incluirArquivados = false): Item[] {
    const linhas = this.db
      .prepare(
        `SELECT id, tipo, nome, categoria, unidade, criado_em, arquivado_em
           FROM item
          WHERE ? = 1 OR arquivado_em IS NULL
          ORDER BY arquivado_em IS NOT NULL, nome COLLATE NOCASE`
      )
      .all(incluirArquivados ? 1 : 0) as LinhaItem[]
    if (linhas.length === 0) return []

    const progs = this.db
      .prepare(
        `SELECT item_id, vigente_de, dia_semana, valor_alvo
           FROM programacao_semanal ORDER BY item_id, vigente_de, dia_semana`
      )
      .all() as LinhaProgramacao[]
    const porItem = agrupar(progs)
    const comHistorico = new Set(
      (this.db.prepare('SELECT DISTINCT item_id FROM registro').all() as { item_id: number }[]).map(
        (r) => r.item_id
      )
    )
    const comAvaliacoes = new Set(
      (
        this.db.prepare('SELECT DISTINCT item_id FROM avaliacao').all() as { item_id: number }[]
      ).map((r) => r.item_id)
    )
    const hoje = this.hoje()
    return linhas.map((l) =>
      this.montar(l, porItem.get(l.id) ?? [], hoje, comHistorico.has(l.id), comAvaliacoes.has(l.id))
    )
  }

  obter(id: number): Item {
    return this.montar(
      this.linha(id),
      this.listarProgramacoes(id),
      this.hoje(),
      this.temHistorico(id),
      this.temAvaliacoes(id)
    )
  }

  private temAvaliacoes(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM avaliacao WHERE item_id = ? LIMIT 1').get(id) !== undefined
  }

  private temHistorico(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM registro WHERE item_id = ? LIMIT 1').get(id) !== undefined
  }

  /** Histórico completo de programações do item (passadas, atual e futuras). */
  listarProgramacoes(id: number): Programacao[] {
    const linhas = this.db
      .prepare(
        `SELECT item_id, vigente_de, dia_semana, valor_alvo
           FROM programacao_semanal WHERE item_id = ? ORDER BY vigente_de, dia_semana`
      )
      .all(id) as LinhaProgramacao[]
    return agrupar(linhas).get(id) ?? []
  }

  criar(novo: NovoItem): Item {
    const hoje = this.hoje()
    try {
      const id = this.db.transaction(() => {
        const r = this.db
          .prepare(
            'INSERT INTO item (tipo, nome, categoria, unidade, criado_em) VALUES (?, ?, ?, ?, ?)'
          )
          .run(novo.tipo, novo.nome, novo.categoria, novo.unidade, hoje)
        const novoId = Number(r.lastInsertRowid)
        this.gravarProgramacao(novoId, hoje, novo.metas)
        return novoId
      })()
      return this.obter(id)
    } catch (erro) {
      if (ehUnicidade(erro)) throw new ErroDominio(MSG_NOME_REPETIDO, 'nome')
      throw erro
    }
  }

  editar(id: number, dados: EdicaoItem): Item {
    const atual = this.linha(id)
    if (atual.arquivado_em !== null) {
      throw new ErroDominio('Desarquive o item antes de editar.')
    }
    if (dados.unidade !== atual.unidade && this.temHistorico(id)) {
      throw new ErroDominio(
        'A unidade não pode mudar porque o item já tem registros. Arquive-o e crie outro com a nova unidade.',
        'unidade'
      )
    }
    try {
      this.db
        .prepare('UPDATE item SET nome = ?, categoria = ?, unidade = ? WHERE id = ?')
        .run(dados.nome, dados.categoria, dados.unidade, id)
    } catch (erro) {
      if (ehUnicidade(erro)) throw new ErroDominio(MSG_NOME_REPETIDO, 'nome')
      throw erro
    }
    return this.obter(id)
  }

  /**
   * Agenda uma nova programação semanal a partir de `vigenteDe` (hoje ou futuro).
   * Programações de datas anteriores nunca mudam, então o histórico é preservado.
   * Se já existir uma programação agendada exatamente nessa data, ela é substituída.
   */
  definirProgramacao(id: number, metas: MetaDia[], vigenteDe: string): Item {
    const atual = this.linha(id)
    if (atual.arquivado_em !== null) {
      throw new ErroDominio('Desarquive o item antes de alterar a programação.')
    }
    if (vigenteDe < this.hoje()) {
      throw new ErroDominio(
        'A programação só pode ser alterada a partir de hoje; dias anteriores mantêm a meta original.',
        'vigenteDe'
      )
    }
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM programacao_semanal WHERE item_id = ? AND vigente_de = ?')
        .run(id, vigenteDe)
      this.gravarProgramacao(id, vigenteDe, metas)
    })()
    return this.obter(id)
  }

  arquivar(id: number): Item {
    const atual = this.linha(id)
    if (atual.arquivado_em === null) {
      this.db.prepare('UPDATE item SET arquivado_em = ? WHERE id = ?').run(this.hoje(), id)
    }
    return this.obter(id)
  }

  desarquivar(id: number): Item {
    this.linha(id)
    try {
      this.db.prepare('UPDATE item SET arquivado_em = NULL WHERE id = ?').run(id)
    } catch (erro) {
      if (ehUnicidade(erro)) {
        throw new ErroDominio(
          'Já existe um item ativo com o mesmo nome. Renomeie ou arquive o outro antes.'
        )
      }
      throw erro
    }
    return this.obter(id)
  }

  /** Exclusão definitiva: só para itens já arquivados (arquivar é o caminho padrão). */
  excluir(id: number): void {
    const atual = this.linha(id)
    if (atual.arquivado_em === null) {
      throw new ErroDominio('Arquive o item antes de excluí-lo definitivamente.')
    }
    if (this.temHistorico(id)) {
      throw new ErroDominio(
        'Este item tem registros e não pode ser excluído; mantenha-o arquivado para preservar o histórico.'
      )
    }
    if (this.temAvaliacoes(id)) {
      throw new ErroDominio(
        'Esta habilidade tem autoavaliações e não pode ser excluída; mantenha-a arquivada para preservar o histórico.'
      )
    }
    this.db.prepare('DELETE FROM item WHERE id = ?').run(id)
  }

  private gravarProgramacao(itemId: number, vigenteDe: string, metas: MetaDia[]): void {
    const inserir = this.db.prepare(
      `INSERT INTO programacao_semanal (item_id, vigente_de, dia_semana, valor_alvo)
       VALUES (?, ?, ?, ?)`
    )
    metas.forEach((meta, i) => inserir.run(itemId, vigenteDe, i + 1, meta))
  }

  private linha(id: number): LinhaItem {
    const l = this.db
      .prepare(
        `SELECT id, tipo, nome, categoria, unidade, criado_em, arquivado_em
           FROM item WHERE id = ?`
      )
      .get(id) as LinhaItem | undefined
    if (!l) throw new ErroDominio('Item não encontrado.')
    return l
  }

  private montar(
    l: LinhaItem,
    progs: Programacao[],
    hoje: string,
    temHistorico: boolean,
    temAvaliacoes: boolean
  ): Item {
    // progs está em ordem de vigente_de; a vigente é a última com data <= hoje.
    const programacaoAtual = progs.filter((p) => p.vigenteDe <= hoje).at(-1) ?? progs[0]
    if (!programacaoAtual) throw new Error(`Item ${l.id} sem programação cadastrada.`)
    return {
      id: l.id,
      tipo: l.tipo,
      nome: l.nome,
      categoria: l.categoria,
      unidade: l.unidade,
      criadoEm: l.criado_em,
      arquivadoEm: l.arquivado_em,
      temHistorico,
      temAvaliacoes,
      programacaoAtual,
      programacoesFuturas: progs.filter((p) => p.vigenteDe > hoje)
    }
  }
}
