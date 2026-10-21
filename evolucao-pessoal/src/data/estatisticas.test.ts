import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MetaDia, NovoItem } from '../shared/item'
import { abrirBanco } from './banco'
import { DiarioRepositorio } from './diario'
import { EstatisticasRepositorio } from './estatisticas'
import { ItemRepositorio } from './itens'

const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)
const novo = (nome: string, unidade: string, metas: MetaDia[] = semana(10)): NovoItem => ({
  tipo: 'habito',
  nome,
  categoria: null,
  unidade,
  metas
})
const reg = (status: 'concluido' | 'parcial' | 'nao_realizado', valor: number | null) => ({
  status,
  valorRealizado: valor,
  observacao: null
})

let pasta: string
let hoje: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-est-'))
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

function montar(caminho = ':memory:') {
  const db = abrirBanco(caminho)
  const itens = new ItemRepositorio(db, () => hoje)
  const diario = new DiarioRepositorio(db, itens, () => hoje)
  const est = new EstatisticasRepositorio(db, itens, () => hoje)
  return { db, itens, diario, est }
}

/** Cenário: criado em 01/10 (quinta); hoje = 10/10 (sábado). */
function cenario(caminho = ':memory:') {
  hoje = '2026-10-01'
  const c = montar(caminho)
  const leitura = c.itens.criar(novo('Leitura', 'páginas'))
  const violao = c.itens.criar(novo('Violão', 'minutos'))
  hoje = '2026-10-10'
  return { ...c, leitura: leitura.id, violao: violao.id }
}

describe('EstatisticasRepositorio', () => {
  it('calcula por atividade e no geral a partir dos registros reais', () => {
    const { diario, est, leitura, violao } = cenario()
    for (const d of ['01', '02', '03', '04', '05']) diario.registrar(leitura, `2026-10-${d}`, reg('concluido', 10))
    diario.registrar(leitura, '2026-10-06', reg('parcial', 3))
    diario.registrar(leitura, '2026-10-07', reg('nao_realizado', null))
    // 08 e 09 sem registro
    diario.registrar(violao, '2026-10-09', reg('concluido', 45))
    diario.definirDescanso(violao, '2026-10-02', 'prova')

    const r = est.obter('completo')
    const l = r.atividades.find((a) => a.nome === 'Leitura')
    expect(l?.contagens).toEqual({
      previstos: 9,
      concluidos: 5,
      parciais: 1,
      naoRealizados: 1,
      semRegistro: 2,
      descansos: 0,
      praticaEmDescanso: 0
    })
    expect(l?.consistencia).toBeCloseTo(66.67, 1)
    expect(l?.cumprimento).toBeCloseTo(55.56, 1)
    expect(l?.quantidadeTotal).toBe(53)
    expect(l?.unidade).toBe('páginas')
    expect(l?.sequenciaAtual).toBe(0)
    expect(l?.maiorSequencia).toBe(6)

    const v = r.atividades.find((a) => a.nome === 'Violão')
    expect(v?.contagens).toMatchObject({ previstos: 8, descansos: 1, concluidos: 1, semRegistro: 7 })
    expect(v?.quantidadeTotal).toBe(45)
    expect(v?.unidade).toBe('minutos')

    // Geral: soma de dias; sem quantidade somada entre unidades diferentes.
    expect(r.geral.contagens).toMatchObject({ previstos: 17, concluidos: 6, parciais: 1 })
    expect(r.geral.atividadesComDados).toBe(2)
    expect(r.geral).not.toHaveProperty('quantidadeTotal')
    expect(r.hoje).toBe('2026-10-10')
  })

  it('usa a programação histórica e preserva o passado quando a meta muda', () => {
    const { itens, est, leitura } = cenario()
    // A partir de hoje (10/10) sábado e domingo viram descanso; dias passados não mudam.
    itens.definirProgramacao(leitura, [10, 10, 10, 10, 10, null, null], '2026-10-10')
    const r = est.obter('completo').atividades.find((a) => a.nome === 'Leitura')
    expect(r?.contagens.previstos).toBe(9) // 03/10 (sáb) e 04/10 (dom) continuam previstos
    expect(r?.contagens.descansos).toBe(0)
  })

  it('arquivada: dias após o arquivamento não contam; some se não tem dias no período', () => {
    const { itens, est, leitura } = cenario()
    hoje = '2026-10-05'
    itens.arquivar(leitura) // arquivada em 05/10
    hoje = '2026-10-10'
    const completo = est.obter('completo').atividades.find((a) => a.nome === 'Leitura')
    expect(completo).toMatchObject({ arquivada: true, janela: { inicio: '2026-10-01', fim: '2026-10-04' } })
    expect(completo?.contagens.previstos).toBe(4)

    hoje = '2026-12-01' // período de 7 dias bem depois do arquivamento
    const recente = est.obter('7d').atividades.find((a) => a.nome === 'Leitura')
    expect(recente).toBeUndefined()
  })

  it('período 7d considera os 7 dias que antecedem hoje', () => {
    const { diario, est, leitura } = cenario()
    diario.registrar(leitura, '2026-10-02', reg('concluido', 1)) // fora de 7d (03..09)
    diario.registrar(leitura, '2026-10-09', reg('concluido', 2))
    const a = est.obter('7d').atividades.find((x) => x.nome === 'Leitura')
    expect(a?.janela).toEqual({ inicio: '2026-10-03', fim: '2026-10-09' })
    expect(a?.contagens).toMatchObject({ previstos: 7, concluidos: 1, semRegistro: 6 })
    expect(a?.quantidadeTotal).toBe(2)
  })

  it('métricas não gravam nada e não alteram registros', () => {
    const { db, diario, est, leitura } = cenario()
    diario.registrar(leitura, '2026-10-05', reg('concluido', 10))
    const antes = db.prepare('SELECT * FROM registro').all()
    est.obter('completo')
    est.obter('7d')
    expect(db.prepare('SELECT * FROM registro').all()).toEqual(antes)
    expect(db.prepare('SELECT COUNT(*) AS n FROM registro').get()).toEqual({ n: 1 }) // sem registros automáticos
  })

  it('os mesmos resultados são obtidos após fechar e reabrir o banco', () => {
    const caminho = join(pasta, 'evolucao.db')
    const a = cenario(caminho)
    a.diario.registrar(a.leitura, '2026-10-03', reg('concluido', 12))
    a.diario.registrar(a.leitura, '2026-10-04', reg('parcial', 4))
    a.diario.definirDescanso(a.leitura, '2026-10-05', null)
    const antes = a.est.obter('completo')
    a.db.close()

    const b = montar(caminho)
    expect(b.est.obter('completo')).toEqual(antes)
    b.db.close()
  })
})
