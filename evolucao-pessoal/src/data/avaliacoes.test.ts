import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErroDominio } from '../core/erros'
import { validarNovaAvaliacao } from '../core/validacao'
import type { MetaDia, NovoItem } from '../shared/item'
import { AvaliacaoRepositorio } from './avaliacoes'
import { abrirBanco } from './banco'
import { DiarioRepositorio } from './diario'
import { EstatisticasRepositorio } from './estatisticas'
import { EvolucaoRepositorio } from './evolucao'
import { ItemRepositorio } from './itens'

const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)
const violao: NovoItem = {
  tipo: 'habilidade',
  nome: 'Violão',
  categoria: 'Música',
  unidade: 'minutos',
  metas: semana(30)
}
const leitura: NovoItem = { ...violao, tipo: 'habito', nome: 'Leitura', unidade: 'páginas' }
const nota = (n: number, observacao: string | null = null) => ({ nota: n, observacao })

let pasta: string
let hoje: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-aval-'))
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

function montar(caminho = ':memory:') {
  const db = abrirBanco(caminho)
  const itens = new ItemRepositorio(db, () => hoje)
  const diario = new DiarioRepositorio(db, itens, () => hoje)
  const aval = new AvaliacaoRepositorio(db, itens, () => hoje)
  const est = new EstatisticasRepositorio(db, itens, () => hoje)
  const evo = new EvolucaoRepositorio(db, itens, () => hoje)
  return { db, itens, diario, aval, est, evo }
}

/** Habilidade e hábito criados em 01/10/2026; hoje = 10/10/2026. */
function cenario(caminho = ':memory:') {
  hoje = '2026-10-01'
  const c = montar(caminho)
  const hab = c.itens.criar(violao)
  const habito = c.itens.criar(leitura)
  hoje = '2026-10-10'
  return { ...c, hab: hab.id, habito: habito.id }
}

describe('validarNovaAvaliacao', () => {
  it('aceita 0 e 10 e todos os inteiros entre eles', () => {
    for (let n = 0; n <= 10; n++) expect(validarNovaAvaliacao({ nota: n }).nota).toBe(n)
  })

  it.each([[-1], [11], [5.5], [0.1], [10.0001], [Number.NaN], [Infinity], ['7'], [null], [undefined]])(
    'rejeita nota %j',
    (n) => {
      try {
        validarNovaAvaliacao({ nota: n })
        expect.unreachable('deveria ter lançado')
      } catch (e) {
        expect(e).toBeInstanceOf(ErroDominio)
        expect((e as ErroDominio).campo).toBe('nota')
      }
    }
  )

  it('observação é opcional, aparada e limitada a 500 caracteres', () => {
    expect(validarNovaAvaliacao({ nota: 3 }).observacao).toBeNull()
    expect(validarNovaAvaliacao({ nota: 3, observacao: '   ' }).observacao).toBeNull()
    expect(validarNovaAvaliacao({ nota: 3, observacao: ' evoluí ' }).observacao).toBe('evoluí')
    expect(() => validarNovaAvaliacao({ nota: 3, observacao: 'x'.repeat(501) })).toThrow(ErroDominio)
    expect(() => validarNovaAvaliacao({ nota: 3, observacao: 5 })).toThrow(ErroDominio)
    expect(() => validarNovaAvaliacao(null)).toThrow(ErroDominio)
  })
})

describe('AvaliacaoRepositorio', () => {
  it('cria, edita (substitui na mesma data) e remove, mantendo uma por data', () => {
    const { db, aval, hab } = cenario()
    const a = aval.salvar(hab, '2026-10-05', nota(4, 'iniciante'))
    expect(a).toMatchObject({ itemId: hab, data: '2026-10-05', nota: 4, observacao: 'iniciante' })

    const b = aval.salvar(hab, '2026-10-05', nota(6))
    expect(b.id).toBe(a.id)
    expect(b).toMatchObject({ nota: 6, observacao: null })
    expect(db.prepare('SELECT COUNT(*) AS n FROM avaliacao').get()).toEqual({ n: 1 })

    aval.remover(hab, '2026-10-05')
    expect(aval.historico(hab).avaliacoes).toEqual([])
    expect(() => aval.remover(hab, '2026-10-05')).not.toThrow() // idempotente
  })

  it('aceita notas 0 e 10 no banco', () => {
    const { aval, hab } = cenario()
    expect(aval.salvar(hab, '2026-10-02', nota(0)).nota).toBe(0)
    expect(aval.salvar(hab, '2026-10-03', nota(10)).nota).toBe(10)
  })

  it('histórico em ordem cronológica, com última e variação (sobe, desce, igual)', () => {
    const { aval, hab } = cenario()
    aval.salvar(hab, '2026-10-08', nota(5)) // inseridas fora de ordem
    aval.salvar(hab, '2026-10-02', nota(3))
    let h = aval.historico(hab)
    expect(h.avaliacoes.map((x) => x.data)).toEqual(['2026-10-02', '2026-10-08'])
    expect(h.resumo).toMatchObject({ variacao: 2, total: 2 }) // subiu
    expect(h.resumo.ultima?.nota).toBe(5)
    expect(h.resumo.anterior?.nota).toBe(3)

    aval.salvar(hab, '2026-10-09', nota(4))
    expect(aval.historico(hab).resumo.variacao).toBe(-1) // desceu
    aval.salvar(hab, '2026-10-10', nota(4))
    h = aval.historico(hab)
    expect(h.resumo.variacao).toBe(0) // igual
    expect(h.resumo.ultima?.data).toBe('2026-10-10')
  })

  it('sem avaliações ou com uma só: variação nula; nada é inventado', () => {
    const { aval, hab } = cenario()
    expect(aval.historico(hab).resumo).toEqual({ ultima: null, anterior: null, variacao: null, total: 0 })
    aval.salvar(hab, '2026-10-05', nota(7))
    const r = aval.historico(hab).resumo
    expect(r.variacao).toBeNull()
    expect(r.anterior).toBeNull()
    expect(aval.historico(hab).avaliacoes).toHaveLength(1)
  })

  it('rejeita data futura e anterior à criação (hoje e a data de criação são aceitos)', () => {
    const { aval, hab } = cenario()
    expect(() => aval.salvar(hab, '2026-10-11', nota(5))).toThrow(/data futura/)
    expect(() => aval.salvar(hab, '2026-09-30', nota(5))).toThrow(/a partir de 01\/10\/2026/)
    expect(() => aval.salvar(hab, '2026-10-10', nota(5))).not.toThrow() // hoje
    expect(() => aval.salvar(hab, '2026-10-01', nota(5))).not.toThrow() // criação
  })

  it('só habilidades: hábito é recusado e some do resumo', () => {
    const { aval, habito, hab } = cenario()
    expect(() => aval.salvar(habito, '2026-10-05', nota(5))).toThrow(/só para habilidades/)
    expect(() => aval.historico(habito)).toThrow(/só para habilidades/)
    expect(() => aval.remover(habito, '2026-10-05')).toThrow(/só para habilidades/)
    expect(aval.resumoHabilidades().map((h) => h.itemId)).toEqual([hab])
  })

  it('habilidade arquivada: consulta o histórico, mas não altera nem é reativada', () => {
    const { itens, aval, hab } = cenario()
    aval.salvar(hab, '2026-10-05', nota(6))
    itens.arquivar(hab)
    const h = aval.historico(hab)
    expect(h.habilidade.arquivada).toBe(true)
    expect(h.avaliacoes).toHaveLength(1)
    expect(aval.resumoHabilidades()[0]).toMatchObject({ arquivada: true, total: 1 })
    expect(() => aval.salvar(hab, '2026-10-06', nota(7))).toThrow(/arquivada/)
    expect(() => aval.remover(hab, '2026-10-05')).toThrow(/arquivada/)
    expect(itens.obter(hab).arquivadoEm).not.toBeNull()
  })

  it('habilidade com avaliações não pode ser excluída (nem pelo banco)', () => {
    const { db, itens, aval, hab } = cenario()
    expect(itens.obter(hab).temAvaliacoes).toBe(false)
    aval.salvar(hab, '2026-10-05', nota(6))
    expect(itens.obter(hab).temAvaliacoes).toBe(true)
    expect(itens.listar(true).find((i) => i.id === hab)?.temAvaliacoes).toBe(true)
    itens.arquivar(hab)
    expect(() => itens.excluir(hab)).toThrow(/autoavaliações/)
    expect(() => db.prepare('DELETE FROM item WHERE id = ?').run(hab)).toThrow(/FOREIGN KEY/)
  })
})

describe('independência entre prática e autoavaliação', () => {
  it('registrar prática não altera a nota', () => {
    const { diario, aval, hab } = cenario()
    aval.salvar(hab, '2026-10-05', nota(4, 'minha percepção'))
    const antes = aval.historico(hab)

    for (const d of ['02', '03', '04', '05', '06']) {
      diario.registrar(hab, `2026-10-${d}`, { status: 'concluido', valorRealizado: 120, observacao: null })
    }
    diario.registrar(hab, '2026-10-07', { status: 'nao_realizado', valorRealizado: null, observacao: null })

    expect(aval.historico(hab)).toEqual(antes)
    expect(aval.resumoHabilidades()[0]?.ultima?.nota).toBe(4)
  })

  it('alterar a nota não modifica estatísticas nem visualizações de prática', () => {
    const { diario, aval, est, evo, hab } = cenario()
    diario.registrar(hab, '2026-10-02', { status: 'concluido', valorRealizado: 40, observacao: null })
    diario.registrar(hab, '2026-10-03', { status: 'parcial', valorRealizado: 10, observacao: null })
    const consulta = { itemId: hab, mes: '2026-10', periodo: 'completo' as const }
    const estAntes = est.obter('completo')
    const evoAntes = evo.obter(consulta)

    aval.salvar(hab, '2026-10-02', nota(2))
    aval.salvar(hab, '2026-10-09', nota(9, 'subi muito'))
    aval.salvar(hab, '2026-10-09', nota(1))
    aval.remover(hab, '2026-10-02')

    expect(est.obter('completo')).toEqual(estAntes)
    expect(evo.obter(consulta)).toEqual(evoAntes)
  })

  it('não altera registros, metas nem descansos existentes', () => {
    const { db, diario, aval, hab } = cenario()
    diario.registrar(hab, '2026-10-02', { status: 'concluido', valorRealizado: 40, observacao: 'ok' })
    diario.definirDescanso(hab, '2026-10-04', null)
    const tabelas = ['registro', 'programacao_semanal', 'descanso_data', 'item']
    const foto = () => tabelas.map((t) => db.prepare(`SELECT * FROM ${t}`).all())
    const antes = foto()
    aval.salvar(hab, '2026-10-05', nota(8))
    aval.remover(hab, '2026-10-05')
    expect(foto()).toEqual(antes)
  })
})

describe('persistência', () => {
  it('avaliações sobrevivem a fechar e reabrir o banco', () => {
    const caminho = join(pasta, 'evolucao.db')
    const a = cenario(caminho)
    a.aval.salvar(a.hab, '2026-10-02', nota(3, 'começando'))
    a.aval.salvar(a.hab, '2026-10-09', nota(5))
    const antes = a.aval.historico(a.hab)
    a.db.close()

    const b = montar(caminho)
    expect(b.aval.historico(a.hab)).toEqual(antes)
    expect(b.aval.resumoHabilidades()[0]).toMatchObject({ total: 2, variacao: 2 })
    b.db.close()
  })

  it('migra banco anterior (versão 4) sem perder dados', () => {
    const caminho = join(pasta, 'v4.db')
    hoje = '2026-10-01'
    const v4 = abrirBanco(caminho)
    // simula app antigo: remove a migração 005 do registro e a tabela
    v4.exec("DROP TABLE avaliacao; DELETE FROM schema_migrations WHERE versao = 5;")
    // item criado no formato anterior (sem a tabela de avaliação): SQL direto
    v4.prepare(
      "INSERT INTO item (tipo, nome, categoria, unidade, criado_em) VALUES ('habilidade','Antiga',NULL,'min','2026-10-01')"
    ).run()
    v4.prepare("INSERT INTO programacao_semanal (item_id, vigente_de, dia_semana, valor_alvo) VALUES (1,'2026-10-01',1,5)").run()
    v4.close()

    hoje = '2026-10-10'
    const db = abrirBanco(caminho)
    const repos = new ItemRepositorio(db, () => hoje)
    const aval = new AvaliacaoRepositorio(db, repos, () => hoje)
    expect(repos.listar(true)).toHaveLength(1)
    expect(aval.salvar(1, '2026-10-05', nota(5)).nota).toBe(5)
    db.close()
  })
})
