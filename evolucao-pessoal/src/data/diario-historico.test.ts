import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MetaDia, NovoItem } from '../shared/item'
import type { NovoRegistro } from '../shared/registro'
import { abrirBanco } from './banco'
import { DiarioRepositorio } from './diario'
import { ItemRepositorio } from './itens'

const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)
const leitura: NovoItem = {
  tipo: 'habito',
  nome: 'Leitura',
  categoria: null,
  unidade: 'páginas',
  metas: semana(10)
}
const concluido: NovoRegistro = { status: 'concluido', valorRealizado: 12, observacao: null }

let pasta: string
let hoje: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-hist-'))
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

function montar(caminho = ':memory:') {
  const db = abrirBanco(caminho)
  const itens = new ItemRepositorio(db, () => hoje)
  const diario = new DiarioRepositorio(db, itens, () => hoje)
  return { db, itens, diario }
}

/** Item criado em 2026-10-01 (meta 10); em 2026-10-10 a programação passa a 20; "hoje" = 2026-10-15 (quinta). */
function cenario(caminho = ':memory:') {
  hoje = '2026-10-01'
  const c = montar(caminho)
  const { id } = c.itens.criar(leitura)
  hoje = '2026-10-10'
  c.itens.definirProgramacao(id, semana(20), hoje)
  hoje = '2026-10-15'
  return { ...c, id }
}

describe('dias anteriores', () => {
  it('mostra a meta que valia em cada data (programação histórica)', () => {
    const { diario } = cenario()
    expect(diario.obterDia('2026-10-05').atividades[0]?.meta).toBe(10)
    expect(diario.obterDia('2026-10-09').atividades[0]?.meta).toBe(10)
    expect(diario.obterDia('2026-10-10').atividades[0]?.meta).toBe(20)
    expect(diario.obterDia('2026-10-14').atividades[0]?.meta).toBe(20)
  })

  it('cria, edita e remove registro de data passada, no máximo um por data', () => {
    const { db, diario, id } = cenario()
    const criado = diario.registrar(id, '2026-10-05', {
      status: 'parcial',
      valorRealizado: 4,
      observacao: 'cansado'
    })
    expect(criado.registro).toMatchObject({
      data: '2026-10-05',
      status: 'parcial',
      valorRealizado: 4,
      metaNoDia: 10
    })

    const editado = diario.registrar(id, '2026-10-05', {
      status: 'concluido',
      valorRealizado: 14,
      observacao: null
    })
    expect(editado.registro?.id).toBe(criado.registro?.id)
    expect(editado.registro).toMatchObject({
      status: 'concluido',
      valorRealizado: 14,
      observacao: null,
      metaNoDia: 10
    })
    expect(db.prepare('SELECT COUNT(*) AS n FROM registro').get()).toEqual({ n: 1 })

    expect(diario.limpar(id, '2026-10-05').registro).toBeNull()
    expect(db.prepare('SELECT COUNT(*) AS n FROM registro').get()).toEqual({ n: 0 })
  })

  it('registro antigo mantém a meta original mesmo com a programação alterada depois', () => {
    const { diario, itens, id } = cenario()
    diario.registrar(id, '2026-10-05', concluido) // meta 10 na época
    itens.definirProgramacao(id, semana(99), hoje) // nova programação a partir de hoje
    const dia = diario.obterDia('2026-10-05').atividades[0]
    expect(dia?.meta).toBe(10)
    expect(dia?.registro?.metaNoDia).toBe(10)
    diario.registrar(id, '2026-10-05', { status: 'parcial', valorRealizado: 1, observacao: null })
    expect(diario.obterDia('2026-10-05').atividades[0]?.registro?.metaNoDia).toBe(10)
  })

  it('diferencia pendente, sem registro, não realizado e descanso', () => {
    const { diario, itens, id } = cenario()
    expect(diario.obterDia('2026-10-15').atividades[0]?.situacao).toBe('pendente')
    expect(diario.obterDia('2026-10-14').atividades[0]?.situacao).toBe('sem_registro')

    diario.registrar(id, '2026-10-14', {
      status: 'nao_realizado',
      valorRealizado: null,
      observacao: null
    })
    const nr = diario.obterDia('2026-10-14').atividades[0]
    expect(nr?.situacao).toBe('registrado')
    expect(nr?.registro?.status).toBe('nao_realizado')

    // descanso da programação semanal (domingo = último dia)
    itens.definirProgramacao(id, [20, 20, 20, 20, 20, 20, null], '2026-10-15')
    const domingo = diario.obterDia('2026-10-18').atividades[0]
    expect(domingo?.situacao).toBe('descanso')
    expect(domingo?.descansoExcepcional).toBeNull()
  })

  it('descanso excepcional vale só na data, não altera a programação e aceita registro', () => {
    const { diario, itens, id } = cenario()
    const antes = itens.listarProgramacoes(id)
    const r = diario.definirDescanso(id, '2026-10-12', 'viagem')
    expect(r).toMatchObject({
      situacao: 'descanso',
      meta: null,
      metaProgramada: 20,
      descansoExcepcional: { motivo: 'viagem' }
    })
    expect(diario.obterDia('2026-10-13').atividades[0]?.situacao).toBe('sem_registro')
    expect(itens.listarProgramacoes(id)).toEqual(antes)

    const reg = diario.registrar(id, '2026-10-12', {
      status: 'concluido',
      valorRealizado: 5,
      observacao: null
    })
    expect(reg.registro?.metaNoDia).toBeNull()
    expect(reg.situacao).toBe('registrado')

    expect(diario.definirDescanso(id, '2026-10-12', null).descansoExcepcional).toEqual({ motivo: null })
    const removido = diario.removerDescanso(id, '2026-10-12')
    expect(removido.descansoExcepcional).toBeNull()
    expect(removido.meta).toBe(20)
    expect(removido.registro?.metaNoDia).toBeNull() // registro existente não é reescrito
  })

  it('impede registro em data futura, mas permite agendar descanso (com limite)', () => {
    const { diario, id } = cenario()
    expect(() => diario.registrar(id, '2026-10-16', concluido)).toThrow(/data futura/)
    const futuro = diario.definirDescanso(id, '2026-10-20', 'folga')
    expect(futuro.situacao).toBe('descanso')
    expect(diario.obterDia('2026-10-17').atividades[0]?.situacao).toBe('futuro')
    expect(() => diario.definirDescanso(id, '2028-10-15', null)).toThrow(/distante/)
  })

  it('não permite datas anteriores à criação da atividade', () => {
    const { diario, id } = cenario()
    expect(diario.obterDia('2026-09-30').atividades).toHaveLength(0)
    expect(() => diario.registrar(id, '2026-09-30', concluido)).toThrow(/a partir de 01\/10\/2026/)
    expect(() => diario.definirDescanso(id, '2026-09-30', null)).toThrow(/a partir de/)
  })

  it('atividades arquivadas: consulta histórica sem reativar nem editar', () => {
    const { diario, itens, id } = cenario()
    diario.registrar(id, '2026-10-05', concluido)
    diario.registrar(id, '2026-10-15', concluido)
    itens.arquivar(id) // arquivada em 2026-10-15

    const passado = diario.obterDia('2026-10-05').atividades[0]
    expect(passado).toMatchObject({ arquivada: true, registro: { status: 'concluido' } })
    expect(diario.obterDia('2026-10-07').atividades[0]?.arquivada).toBe(true)

    hoje = '2026-10-20'
    expect(diario.obterDia('2026-10-19').atividades).toHaveLength(0) // após arquivar, sem registro
    expect(diario.obterDia('2026-10-15').atividades[0]?.registro).not.toBeNull()

    expect(() => diario.registrar(id, '2026-10-07', concluido)).toThrow(/arquivada/)
    expect(() => diario.limpar(id, '2026-10-05')).toThrow(/arquivada/)
    expect(() => diario.definirDescanso(id, '2026-10-07', null)).toThrow(/arquivada/)
    expect(itens.obter(id).arquivadoEm).toBe('2026-10-15')
  })

  it('registros e descansos de datas passadas sobrevivem a reabrir o banco', () => {
    const caminho = join(pasta, 'evolucao.db')
    const a = cenario(caminho)
    a.diario.registrar(a.id, '2026-10-05', { status: 'parcial', valorRealizado: 6, observacao: 'tarde' })
    a.diario.definirDescanso(a.id, '2026-10-20', 'folga')
    a.db.close()

    const b = montar(caminho)
    const d5 = b.diario.obterDia('2026-10-05').atividades[0]
    expect(d5?.registro).toMatchObject({
      status: 'parcial',
      valorRealizado: 6,
      metaNoDia: 10,
      observacao: 'tarde'
    })
    expect(d5?.meta).toBe(10)
    expect(b.diario.obterDia('2026-10-20').atividades[0]?.descansoExcepcional).toEqual({ motivo: 'folga' })
    b.db.close()
  })
})
