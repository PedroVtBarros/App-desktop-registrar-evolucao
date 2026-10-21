import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErroDominio } from '../core/erros'
import type { MetaDia, NovoItem } from '../shared/item'
import type { NovoRegistro } from '../shared/registro'
import { abrirBanco } from './banco'
import { DiarioRepositorio } from './diario'
import { ItemRepositorio } from './itens'

const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)
const leitura: NovoItem = {
  tipo: 'habito',
  nome: 'Leitura',
  categoria: 'Estudo',
  unidade: 'páginas',
  metas: semana(10)
}
const concluido: NovoRegistro = { status: 'concluido', valorRealizado: 12, observacao: null }

let pasta: string
let hoje: string // 2026-10-15 = quinta-feira

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-diario-'))
  hoje = '2026-10-15'
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

function montar(caminho = ':memory:') {
  const db = abrirBanco(caminho)
  const itens = new ItemRepositorio(db, () => hoje)
  const diario = new DiarioRepositorio(db, itens, () => hoje)
  return { db, itens, diario }
}

describe('Hoje: listagem e pendência', () => {
  it('mostra itens ativos com a meta de hoje e sem registro (pendente), sem gravar nada', () => {
    const { db, itens, diario } = montar()
    itens.criar(leitura)
    const arquivado = itens.criar({ ...leitura, nome: 'Velho' })
    itens.arquivar(arquivado.id)

    const dia = diario.obterDia(hoje)
    expect(dia.data).toBe(hoje)
    expect(dia.atividades).toHaveLength(1)
    expect(dia.atividades[0]).toMatchObject({ nome: 'Leitura', unidade: 'páginas', meta: 10, registro: null })
    expect(db.prepare('SELECT COUNT(*) AS n FROM registro').get()).toEqual({ n: 0 })
  })

  it('usa a meta do dia da semana e distingue descanso (meta null) de pendente', () => {
    const { itens, diario } = montar()
    // quinta = índice 3
    itens.criar({ ...leitura, metas: [1, 2, 3, 40, 5, 6, 7] })
    expect(diario.obterDia(hoje).atividades[0]?.meta).toBe(40)

    hoje = '2026-10-17' // sábado
    itens.criar({ ...leitura, nome: 'Corrida', metas: [5, 5, 5, 5, 5, null, null] })
    const sabado = diario.obterDia(hoje).atividades.find((a) => a.nome === 'Corrida')
    expect(sabado).toMatchObject({ meta: null, registro: null })
  })
})

describe('Registro do dia', () => {
  it('registra quantidade maior ou menor que a meta e o status é o escolhido, não deduzido', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)

    const maior = diario.registrar(id, hoje, { status: 'parcial', valorRealizado: 25, observacao: 'li muito, mas parei' })
    expect(maior.registro).toMatchObject({ status: 'parcial', valorRealizado: 25, metaNoDia: 10 })

    const menor = diario.registrar(id, hoje, { status: 'concluido', valorRealizado: 3, observacao: null })
    expect(menor.registro).toMatchObject({ status: 'concluido', valorRealizado: 3 })
  })

  it('aceita "não realizado" sem quantidade e valor zero', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)
    const a = diario.registrar(id, hoje, { status: 'nao_realizado', valorRealizado: null, observacao: 'doente' })
    expect(a.registro).toMatchObject({ status: 'nao_realizado', valorRealizado: null, observacao: 'doente' })
    const b = diario.registrar(id, hoje, { status: 'parcial', valorRealizado: 0, observacao: null })
    expect(b.registro?.valorRealizado).toBe(0)
  })

  it('editar não cria duplicata e mantém o mesmo registro', () => {
    const { db, itens, diario } = montar()
    const { id } = itens.criar(leitura)
    const primeiro = diario.registrar(id, hoje, concluido).registro
    const segundo = diario.registrar(id, hoje, { status: 'parcial', valorRealizado: 5, observacao: 'revisado' }).registro
    expect(segundo?.id).toBe(primeiro?.id)
    expect(segundo).toMatchObject({ status: 'parcial', valorRealizado: 5, observacao: 'revisado' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM registro').get()).toEqual({ n: 1 })
  })

  it('preserva a meta vigente no momento do registro quando a programação muda depois', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)
    diario.registrar(id, hoje, concluido) // meta 10
    itens.definirProgramacao(id, semana(30), hoje) // hoje passa a ter meta 30
    expect(itens.obter(id).programacaoAtual.metas[3]).toBe(30)

    const depois = diario.registrar(id, hoje, { status: 'parcial', valorRealizado: 20, observacao: null })
    expect(depois.meta).toBe(30) // meta atual exibida
    expect(depois.registro?.metaNoDia).toBe(10) // snapshot original preservado
  })

  it('permite registrar em dia de descanso, guardando meta_no_dia = null', () => {
    const { itens, diario } = montar()
    hoje = '2026-10-17' // sábado
    const { id } = itens.criar({ ...leitura, metas: [5, 5, 5, 5, 5, null, null] })
    const a = diario.registrar(id, hoje, { status: 'concluido', valorRealizado: 2, observacao: 'extra' })
    expect(a.meta).toBeNull()
    expect(a.registro?.metaNoDia).toBeNull()
  })

  it('limpar volta para pendente e é idempotente', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)
    diario.registrar(id, hoje, concluido)
    expect(diario.limpar(id, hoje).registro).toBeNull()
    expect(diario.limpar(id, hoje).registro).toBeNull()
  })

  it('rejeita item arquivado e inexistente', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)
    itens.arquivar(id)
    expect(() => diario.registrar(id, hoje, concluido)).toThrow(/arquivada/)
    expect(() => diario.registrar(999, hoje, concluido)).toThrow(ErroDominio)
  })

  it('registros de dias diferentes são independentes', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)
    diario.registrar(id, hoje, concluido)
    hoje = '2026-10-16'
    expect(diario.obterDia(hoje).atividades[0]?.registro).toBeNull() // novo dia = pendente
    diario.registrar(id, hoje, { status: 'nao_realizado', valorRealizado: null, observacao: null })
    hoje = '2026-10-15'
    expect(diario.obterDia(hoje).atividades[0]?.registro?.status).toBe('concluido')
  })
})

describe('proteção do histórico', () => {
  it('item com registros: temHistorico, não exclui, não troca unidade, mas pode renomear', () => {
    const { itens, diario } = montar()
    const { id } = itens.criar(leitura)
    expect(itens.obter(id).temHistorico).toBe(false)
    diario.registrar(id, hoje, concluido)
    expect(itens.obter(id).temHistorico).toBe(true)
    expect(itens.listar(true)[0]?.temHistorico).toBe(true)

    expect(() => itens.editar(id, { nome: 'Leitura', categoria: null, unidade: 'min' })).toThrow(
      /unidade não pode mudar/
    )
    expect(itens.editar(id, { nome: 'Leitura técnica', categoria: 'X', unidade: 'páginas' }).nome).toBe(
      'Leitura técnica'
    )

    itens.arquivar(id)
    expect(() => itens.excluir(id)).toThrow(/tem registros/)
    expect(itens.listar(true)).toHaveLength(1)
  })

  it('o banco também protege: trigger e FK RESTRICT valem fora do repositório', () => {
    const { db, itens, diario } = montar()
    const { id } = itens.criar(leitura)
    diario.registrar(id, hoje, concluido)
    expect(() => db.prepare("UPDATE item SET unidade = 'x' WHERE id = ?").run(id)).toThrow(
      /unidade_com_historico/
    )
    expect(() => db.prepare('DELETE FROM item WHERE id = ?').run(id)).toThrow(/FOREIGN KEY/)
  })

  it('sem registros, a unidade pode ser editada e o item excluído após arquivar', () => {
    const { itens } = montar()
    const { id } = itens.criar(leitura)
    expect(itens.editar(id, { nome: 'Leitura', categoria: null, unidade: 'min' }).unidade).toBe('min')
    itens.arquivar(id)
    itens.excluir(id)
    expect(itens.listar(true)).toHaveLength(0)
  })
})

describe('persistência', () => {
  it('registros sobrevivem a fechar e reabrir o banco', () => {
    const caminho = join(pasta, 'evolucao.db')
    const a = montar(caminho)
    const { id } = a.itens.criar(leitura)
    a.diario.registrar(id, hoje, { status: 'parcial', valorRealizado: 7, observacao: 'metade' })
    a.db.close()

    const b = montar(caminho)
    const atividade = b.diario.obterDia(hoje).atividades[0]
    expect(atividade?.registro).toMatchObject({
      status: 'parcial',
      valorRealizado: 7,
      metaNoDia: 10,
      observacao: 'metade',
      data: hoje
    })
    b.db.close()
  })
})
