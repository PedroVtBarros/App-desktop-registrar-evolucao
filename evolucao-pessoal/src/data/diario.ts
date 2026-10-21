import type Database from 'better-sqlite3'
import { dataIsoValida, hojeIso, somarDias } from '../core/datas'
import { ErroDominio } from '../core/erros'
import { metaDoDia } from '../core/programacao'
import type { Item, MetaDia, Programacao } from '../shared/item'
import {
  LIMITE_DIAS_FUTUROS,
  type AtividadeDia,
  type DiaRegistro,
  type NovoRegistro,
  type Registro,
  type SituacaoDia,
  type StatusRegistro
} from '../shared/registro'
import type { ItemRepositorio } from './itens'

interface LinhaRegistro {
  id: number
  item_id: number
  data: string
  status: StatusRegistro
  valor_realizado: number | null
  meta_no_dia: number | null
  observacao: string | null
  atualizado_em: string
}

const COLUNAS =
  'id, item_id, data, status, valor_realizado, meta_no_dia, observacao, atualizado_em'

function paraRegistro(l: LinhaRegistro): Registro {
  return {
    id: l.id,
    itemId: l.item_id,
    data: l.data,
    status: l.status,
    valorRealizado: l.valor_realizado,
    metaNoDia: l.meta_no_dia,
    observacao: l.observacao,
    atualizadoEm: l.atualizado_em
  }
}

function formatar(dataIso: string): string {
  const [a, m, d] = dataIso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Registro diário de qualquer data (passada ou hoje), com descanso excepcional.
 * Recebe dados já validados e usa SQL parametrizado. Nunca altera registros
 * por conta própria: toda escrita parte de uma ação explícita do usuário.
 */
export class DiarioRepositorio {
  constructor(
    private readonly db: Database.Database,
    private readonly itens: ItemRepositorio,
    private readonly hoje: () => string = () => hojeIso(),
    private readonly agora: () => string = () => new Date().toISOString()
  ) {}

  /**
   * Atividades de uma data, com a meta que valia nela (programação histórica).
   * Entram: as que já existiam e estavam ativas na data, mais qualquer uma que
   * tenha registro nessa data (inclusive arquivadas, só para consulta).
   */
  obterDia(data: string): DiaRegistro {
    const registros = new Map(
      (
        this.db
          .prepare(`SELECT ${COLUNAS} FROM registro WHERE data = ?`)
          .all(data) as LinhaRegistro[]
      ).map((l) => [l.item_id, paraRegistro(l)])
    )
    const descansos = new Map(
      (
        this.db
          .prepare('SELECT item_id, motivo FROM descanso_data WHERE data = ?')
          .all(data) as { item_id: number; motivo: string | null }[]
      ).map((l) => [l.item_id, { motivo: l.motivo }])
    )

    const atividades: AtividadeDia[] = []
    for (const item of this.itens.listar(true)) {
      const registro = registros.get(item.id) ?? null
      const existia = item.criadoEm <= data
      const ativaNaData = item.arquivadoEm === null || data < item.arquivadoEm
      if (!registro && !(existia && ativaNaData)) continue
      atividades.push(
        this.atividade(item, this.itens.listarProgramacoes(item.id), data, registro, descansos.get(item.id) ?? null)
      )
    }
    return { data, hoje: this.hoje(), atividades }
  }

  /**
   * Cria ou atualiza o registro da data (no máximo um por atividade e data).
   * A meta da data é capturada na criação e preservada nas edições.
   */
  registrar(itemId: number, data: string, novo: NovoRegistro): AtividadeDia {
    const item = this.itemEditavel(itemId)
    if (data > this.hoje()) {
      throw new ErroDominio('Não é possível registrar em uma data futura.', 'data')
    }
    this.exigirExistencia(item, data)
    const descanso = this.descansoDe(itemId, data)
    const meta = descanso ? null : (metaDoDia(this.itens.listarProgramacoes(itemId), data) ?? null)
    const agora = this.agora()
    this.db
      .prepare(
        `INSERT INTO registro
           (item_id, data, status, valor_realizado, meta_no_dia, observacao, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (item_id, data) DO UPDATE SET
           status = excluded.status,
           valor_realizado = excluded.valor_realizado,
           observacao = excluded.observacao,
           atualizado_em = excluded.atualizado_em`
      )
      .run(itemId, data, novo.status, novo.valorRealizado, meta, novo.observacao, agora, agora)
    return this.atividadeDe(itemId, data)
  }

  /** Remove o registro da data (volta a "pendente"/"sem registro"). Idempotente. */
  limpar(itemId: number, data: string): AtividadeDia {
    this.itemEditavel(itemId)
    this.db.prepare('DELETE FROM registro WHERE item_id = ? AND data = ?').run(itemId, data)
    return this.atividadeDe(itemId, data)
  }

  /** Marca descanso excepcional na data, sem alterar a programação semanal. */
  definirDescanso(itemId: number, data: string, motivo: string | null): AtividadeDia {
    const item = this.itemEditavel(itemId)
    this.exigirExistencia(item, data)
    if (data > somarDias(this.hoje(), LIMITE_DIAS_FUTUROS)) {
      throw new ErroDominio('Data distante demais para agendar descanso.', 'data')
    }
    this.db
      .prepare(
        `INSERT INTO descanso_data (item_id, data, motivo, criado_em) VALUES (?, ?, ?, ?)
         ON CONFLICT (item_id, data) DO UPDATE SET motivo = excluded.motivo`
      )
      .run(itemId, data, motivo, this.agora())
    return this.atividadeDe(itemId, data)
  }

  removerDescanso(itemId: number, data: string): AtividadeDia {
    this.itemEditavel(itemId)
    this.db.prepare('DELETE FROM descanso_data WHERE item_id = ? AND data = ?').run(itemId, data)
    return this.atividadeDe(itemId, data)
  }

  private itemEditavel(itemId: number): Item {
    const item = this.itens.obter(itemId)
    if (item.arquivadoEm !== null) {
      throw new ErroDominio('Atividade arquivada: desarquive-a para registrar ou alterar.')
    }
    return item
  }

  private exigirExistencia(item: Item, data: string): void {
    if (!dataIsoValida(data)) throw new ErroDominio('Data inválida.', 'data')
    if (data < item.criadoEm) {
      throw new ErroDominio(
        `Esta atividade só existe a partir de ${formatar(item.criadoEm)}.`,
        'data'
      )
    }
  }

  private descansoDe(itemId: number, data: string): { motivo: string | null } | null {
    const l = this.db
      .prepare('SELECT motivo FROM descanso_data WHERE item_id = ? AND data = ?')
      .get(itemId, data) as { motivo: string | null } | undefined
    return l ? { motivo: l.motivo } : null
  }

  private atividadeDe(itemId: number, data: string): AtividadeDia {
    const linha = this.db
      .prepare(`SELECT ${COLUNAS} FROM registro WHERE item_id = ? AND data = ?`)
      .get(itemId, data) as LinhaRegistro | undefined
    return this.atividade(
      this.itens.obter(itemId),
      this.itens.listarProgramacoes(itemId),
      data,
      linha ? paraRegistro(linha) : null,
      this.descansoDe(itemId, data)
    )
  }

  private atividade(
    item: Item,
    progs: Programacao[],
    data: string,
    registro: Registro | null,
    descanso: { motivo: string | null } | null
  ): AtividadeDia {
    const metaProgramada: MetaDia = metaDoDia(progs, data) ?? null
    const meta: MetaDia = descanso ? null : metaProgramada
    const hoje = this.hoje()
    let situacao: SituacaoDia
    if (registro) situacao = 'registrado'
    else if (meta === null) situacao = 'descanso'
    else if (data > hoje) situacao = 'futuro'
    else if (data === hoje) situacao = 'pendente'
    else situacao = 'sem_registro'
    return {
      itemId: item.id,
      tipo: item.tipo,
      nome: item.nome,
      categoria: item.categoria,
      unidade: item.unidade,
      arquivada: item.arquivadoEm !== null,
      meta,
      metaProgramada,
      descansoExcepcional: descanso,
      registro,
      situacao
    }
  }
}
