import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErroDominio } from '../core/erros'
import { metaDoDia } from '../core/programacao'
import type { MetaDia, NovoItem } from '../shared/item'
import { abrirBanco } from './banco'
import { ItemRepositorio } from './itens'
import { MIGRACOES, migrar } from './migracoes'

const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)

const leitura: NovoItem = {
  tipo: 'habito',
  nome: 'Leitura',
  categoria: 'Estudo',
  unidade: 'páginas',
  metas: semana(10)
}

let pasta: string
let hoje: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-test-'))
  hoje = '2026-10-15' // quinta-feira
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

function repoEmMemoria(): ItemRepositorio {
  return new ItemRepositorio(abrirBanco(':memory:'), () => hoje)
}

describe('migrações', () => {
  it('são idempotentes e registram as versões', () => {
    const db = abrirBanco(':memory:')
    migrar(db)
    const linhas = db.prepare('SELECT versao FROM schema_migrations').all()
    expect(linhas).toHaveLength(MIGRACOES.length)
  })

  it('recusa banco de versão mais nova', () => {
    const db = abrirBanco(':memory:')
    db.prepare("INSERT INTO schema_migrations VALUES (999, 'futura', 'x')").run()
    expect(() => migrar(db)).toThrow(/mais nova/)
  })

  it('migra dados da etapa 1: cada meta vira a mesma meta nos 7 dias, com a mesma vigência', () => {
    const caminho = join(pasta, 'v1.db')
    const v1 = new Database(caminho)
    v1.pragma('foreign_keys = ON')
    migrar(v1, MIGRACOES.slice(0, 1)) // só a migração 001, como no app da etapa 1
    v1.prepare(
      "INSERT INTO item (tipo, nome, categoria, unidade, criado_em) VALUES ('habito','Leitura','Estudo','páginas','2026-10-01')"
    ).run()
    v1.prepare("INSERT INTO meta_diaria (item_id, valor_alvo, vigente_de) VALUES (1, 10, '2026-10-01')").run()
    v1.prepare("INSERT INTO meta_diaria (item_id, valor_alvo, vigente_de) VALUES (1, 15, '2026-10-20')").run()
    v1.close()

    const db = abrirBanco(caminho)
    const repo = new ItemRepositorio(db, () => hoje)
    expect(repo.listarProgramacoes(1)).toEqual([
      { vigenteDe: '2026-10-01', metas: semana(10) },
      { vigenteDe: '2026-10-20', metas: semana(15) }
    ])
    const item = repo.obter(1)
    expect(item.programacaoAtual.metas).toEqual(semana(10))
    expect(item.programacoesFuturas).toEqual([{ vigenteDe: '2026-10-20', metas: semana(15) }])
    const antiga = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta_diaria'")
      .get()
    expect(antiga).toBeUndefined()
    db.close()
  })
})

describe('ItemRepositorio', () => {
  it('cria item com programação inicial vigente hoje', () => {
    const item = repoEmMemoria().criar(leitura)
    expect(item).toMatchObject({
      tipo: 'habito',
      nome: 'Leitura',
      unidade: 'páginas',
      criadoEm: hoje,
      arquivadoEm: null,
      programacaoAtual: { vigenteDe: hoje, metas: semana(10) },
      programacoesFuturas: []
    })
  })

  it('cria item com metas diferentes por dia e descanso', () => {
    const metas: MetaDia[] = [30, 30, 45, 30, 20, null, null]
    const item = repoEmMemoria().criar({ ...leitura, metas })
    expect(item.programacaoAtual.metas).toEqual(metas)
  })

  it('edita nome, categoria e unidade sem tocar na programação', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    const editado = repo.editar(id, { nome: 'Leitura técnica', categoria: null, unidade: 'min' })
    expect(editado).toMatchObject({ nome: 'Leitura técnica', categoria: null, unidade: 'min' })
    expect(editado.programacaoAtual.metas).toEqual(semana(10))
  })

  it('impede nome repetido entre ativos (sem diferenciar maiúsculas), mas libera após arquivar', () => {
    const repo = repoEmMemoria()
    const a = repo.criar(leitura)
    expect(() => repo.criar({ ...leitura, nome: 'LEITURA' })).toThrow(ErroDominio)
    repo.arquivar(a.id)
    expect(() => repo.criar(leitura)).not.toThrow()
    expect(() => repo.desarquivar(a.id)).toThrow(/mesmo nome/)
  })

  it('arquivar tira da lista ativa, mas mantém os dados; desarquivar restaura', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    repo.arquivar(id)
    expect(repo.listar(false)).toHaveLength(0)
    const todos = repo.listar(true)
    expect(todos).toHaveLength(1)
    expect(todos[0]?.arquivadoEm).toBe(hoje)
    repo.desarquivar(id)
    expect(repo.listar(false)).toHaveLength(1)
  })

  it('só exclui itens arquivados', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    expect(() => repo.excluir(id)).toThrow(/Arquive/)
    repo.arquivar(id)
    repo.excluir(id)
    expect(repo.listar(true)).toHaveLength(0)
  })

  it('item inexistente gera erro de domínio', () => {
    expect(() => repoEmMemoria().editar(99, { nome: 'x', categoria: null, unidade: 'u' })).toThrow(
      ErroDominio
    )
  })
})

describe('programação semanal', () => {
  it('programação futura é agendada e a atual não muda até a data chegar', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    const nova: MetaDia[] = [20, 20, 20, 30, 20, null, null]
    const item = repo.definirProgramacao(id, nova, '2026-10-20')
    expect(item.programacaoAtual).toEqual({ vigenteDe: hoje, metas: semana(10) })
    expect(item.programacoesFuturas).toEqual([{ vigenteDe: '2026-10-20', metas: nova }])
  })

  it('preserva o histórico: dias anteriores à vigência seguem a programação antiga', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    const nova: MetaDia[] = [20, 20, 20, 30, 20, null, null]
    repo.definirProgramacao(id, nova, '2026-10-20')

    const todas = repo.listarProgramacoes(id)
    expect(todas).toHaveLength(2)
    expect(metaDoDia(todas, '2026-10-17')).toBe(10) // sábado antes: meta antiga
    expect(metaDoDia(todas, '2026-10-19')).toBe(10) // domingo antes: meta antiga
    expect(metaDoDia(todas, '2026-10-22')).toBe(30) // quinta depois: nova
    expect(metaDoDia(todas, '2026-10-24')).toBeNull() // sábado depois: descanso planejado

    hoje = '2026-10-20' // o tempo passa: a nova vira a atual, a antiga continua gravada
    expect(repo.obter(id).programacaoAtual).toEqual({ vigenteDe: '2026-10-20', metas: nova })
    expect(repo.listarProgramacoes(id)[0]).toEqual({ vigenteDe: '2026-10-15', metas: semana(10) })
  })

  it('alterar a programação de hoje substitui só a de hoje', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    repo.definirProgramacao(id, semana(15), '2026-10-20')
    const item = repo.definirProgramacao(id, [12, 12, 12, 12, 12, null, null], hoje)
    expect(item.programacaoAtual.metas).toEqual([12, 12, 12, 12, 12, null, null])
    expect(item.programacoesFuturas).toEqual([{ vigenteDe: '2026-10-20', metas: semana(15) }])
    expect(repo.listarProgramacoes(id)).toHaveLength(2)
  })

  it('mesma data duas vezes substitui os 7 dias sem sobras', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    repo.definirProgramacao(id, [1, 2, 3, 4, 5, 6, 7], '2026-10-20')
    const item = repo.definirProgramacao(id, [9, null, null, null, null, null, null], '2026-10-20')
    expect(item.programacoesFuturas).toEqual([
      { vigenteDe: '2026-10-20', metas: [9, null, null, null, null, null, null] }
    ])
  })

  it('rejeita alterar programação em data passada', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    expect(() => repo.definirProgramacao(id, semana(20), '2026-10-14')).toThrow(/a partir de hoje/)
    expect(repo.listarProgramacoes(id)).toHaveLength(1)
  })

  it('rejeita alterar programação de item arquivado', () => {
    const repo = repoEmMemoria()
    const { id } = repo.criar(leitura)
    repo.arquivar(id)
    expect(() => repo.definirProgramacao(id, semana(20), hoje)).toThrow(/Desarquive/)
  })

  it('meta nunca muda sozinha: meses depois, os valores são os definidos', () => {
    const repo = repoEmMemoria()
    const metas: MetaDia[] = [10, 20, 30, 40, 50, null, 5]
    const { id } = repo.criar({ ...leitura, metas })
    hoje = '2027-03-01'
    expect(repo.obter(id).programacaoAtual.metas).toEqual(metas)
  })
})

describe('persistência', () => {
  it('dados sobrevivem a fechar e reabrir o banco', () => {
    const caminho = join(pasta, 'evolucao.db')
    const nova: MetaDia[] = [20, 20, 20, 30, 20, null, null]

    const db1 = abrirBanco(caminho)
    const repo1 = new ItemRepositorio(db1, () => hoje)
    const a = repo1.criar(leitura)
    const b = repo1.criar({ ...leitura, nome: 'Violão', tipo: 'habilidade', unidade: 'min' })
    repo1.definirProgramacao(a.id, nova, '2026-10-20')
    repo1.arquivar(b.id)
    db1.close()

    const db2 = abrirBanco(caminho)
    const repo2 = new ItemRepositorio(db2, () => hoje)
    const lista = repo2.listar(true)
    expect(lista.map((i) => i.nome)).toEqual(['Leitura', 'Violão'])
    expect(lista[0]?.programacoesFuturas).toEqual([{ vigenteDe: '2026-10-20', metas: nova }])
    expect(lista[0]?.programacaoAtual.metas).toEqual(semana(10))
    expect(lista[1]?.arquivadoEm).toBe(hoje)
    db2.close()
  })
})
