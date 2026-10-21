import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErroDominio } from '../core/erros'
import { validarConsultaEvolucao } from '../core/validacao'
import type { ConsultaEvolucao } from '../shared/evolucao'
import type { MetaDia, NovoItem } from '../shared/item'
import { abrirBanco } from './banco'
import { DiarioRepositorio } from './diario'
import { EstatisticasRepositorio } from './estatisticas'
import { EvolucaoRepositorio } from './evolucao'
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
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-evo-'))
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

function montar(caminho = ':memory:') {
  const db = abrirBanco(caminho)
  const itens = new ItemRepositorio(db, () => hoje)
  const diario = new DiarioRepositorio(db, itens, () => hoje)
  const est = new EstatisticasRepositorio(db, itens, () => hoje)
  const evo = new EvolucaoRepositorio(db, itens, () => hoje)
  return { db, itens, diario, est, evo }
}

const consulta = (itemId: number | null, mes = '2026-10', periodo: ConsultaEvolucao['periodo'] = 'completo'): ConsultaEvolucao => ({
  itemId,
  mes,
  periodo
})

/** Criado em 01/10/2026 (quinta); hoje = 10/10 (sábado). */
function cenario(caminho = ':memory:') {
  hoje = '2026-10-01'
  const c = montar(caminho)
  const leitura = c.itens.criar(novo('Leitura', 'páginas'))
  const violao = c.itens.criar(novo('Violão', 'minutos'))
  hoje = '2026-10-10'
  return { ...c, leitura: leitura.id, violao: violao.id }
}

describe('calendário', () => {
  it('classifica concluído, parcial, não realizado, sem registro, descanso, hoje, futuro e antes da criação', () => {
    const { diario, evo, leitura } = cenario()
    diario.registrar(leitura, '2026-10-01', reg('concluido', 10))
    diario.registrar(leitura, '2026-10-02', reg('parcial', 3))
    diario.registrar(leitura, '2026-10-03', reg('nao_realizado', null))
    diario.definirDescanso(leitura, '2026-10-05', 'folga')
    diario.registrar(leitura, '2026-10-10', reg('concluido', 8)) // hoje

    const r = evo.obter(consulta(leitura))
    const por = new Map((r.calendario ?? []).map((d) => [d.data, d]))
    expect(r.calendario).toHaveLength(31)
    expect(por.get('2026-10-01')).toMatchObject({ estado: 'concluido', quantidade: 10, meta: 10 })
    expect(por.get('2026-10-02')).toMatchObject({ estado: 'parcial', quantidade: 3 })
    expect(por.get('2026-10-03')).toMatchObject({ estado: 'nao_realizado', quantidade: null })
    expect(por.get('2026-10-04')).toMatchObject({ estado: 'sem_registro', quantidade: null })
    expect(por.get('2026-10-05')).toMatchObject({ estado: 'descanso', meta: null, descansoExcepcional: true })
    expect(por.get('2026-10-10')).toMatchObject({ estado: 'concluido', hoje: true })
    expect(por.get('2026-10-11')).toMatchObject({ estado: 'futuro' })

    const setembro = evo.obter(consulta(leitura, '2026-09')).calendario ?? []
    expect(setembro).toHaveLength(30)
    expect(setembro.every((d) => d.estado === 'antes_criacao')).toBe(true)
  })

  it('hoje sem registro é "pendente" e descanso semanal aparece como descanso', () => {
    const { itens, evo, leitura } = cenario()
    itens.definirProgramacao(leitura, [10, 10, 10, 10, 10, null, null], '2026-10-10')
    const dias = new Map((evo.obter(consulta(leitura)).calendario ?? []).map((d) => [d.data, d]))
    expect(dias.get('2026-10-10')).toMatchObject({ estado: 'descanso', descansoExcepcional: false, hoje: true })
    expect(dias.get('2026-10-09')).toMatchObject({ estado: 'sem_registro' })
    const hojeUtil = new Map(
      evo.obter(consulta(leitura, '2026-10')).calendario?.map((d) => [d.data, d])
    )
    expect(hojeUtil.get('2026-10-12')).toMatchObject({ estado: 'futuro', meta: 10 })
  })

  it('prática em dia de descanso fica marcada e não vira "previsto"', () => {
    const { diario, evo, leitura } = cenario()
    diario.definirDescanso(leitura, '2026-10-06', null)
    diario.registrar(leitura, '2026-10-06', reg('concluido', 5))
    const r = evo.obter(consulta(leitura))
    const d = r.calendario?.find((x) => x.data === '2026-10-06')
    expect(d).toMatchObject({ estado: 'descanso', status: 'concluido', praticaEmDescanso: true, quantidade: 5 })
    expect(r.resumo.contagens).toMatchObject({ descansos: 1, praticaEmDescanso: 1, previstos: 8 })
  })

  it('metas históricas: cada data mostra a meta que valia nela', () => {
    const { itens, evo, leitura } = cenario()
    // Programação nova só pode começar de hoje em diante; o passado mantém 10.
    itens.definirProgramacao(leitura, semana(25), '2026-10-10')
    const dias = new Map((evo.obter(consulta(leitura)).calendario ?? []).map((d) => [d.data, d]))
    expect(dias.get('2026-10-05')?.meta).toBe(10)
    expect(dias.get('2026-10-09')?.meta).toBe(10)
    expect(dias.get('2026-10-10')?.meta).toBe(25)
    expect(dias.get('2026-10-20')?.meta).toBe(25)
  })

  it('mudança de mês e de ano', () => {
    hoje = '2026-12-20'
    const c = montar()
    const { id } = c.itens.criar(novo('Corrida', 'km'))
    hoje = '2027-01-10'
    c.diario.registrar(id, '2026-12-31', reg('concluido', 5))
    c.diario.registrar(id, '2027-01-01', reg('parcial', 2))

    const dez = c.evo.obter(consulta(id, '2026-12')).calendario ?? []
    const jan = c.evo.obter(consulta(id, '2027-01')).calendario ?? []
    expect(dez).toHaveLength(31)
    expect(jan).toHaveLength(31)
    expect(dez.at(-1)).toMatchObject({ data: '2026-12-31', estado: 'concluido' })
    expect(jan[0]).toMatchObject({ data: '2027-01-01', estado: 'parcial' })
    expect(dez[0]?.estado).toBe('antes_criacao') // 01/12 < criação (20/12)
    expect(c.evo.obter(consulta(id, '2028-02')).calendario).toHaveLength(29) // bissexto

    // blocos cruzando o ano: semana de 28/12 a 03/01 e dois meses
    const r = c.evo.obter(consulta(id))
    const sem = r.semanas.find((s) => s.chave === '2026-12-28')
    expect(sem).toMatchObject({ inicio: '2026-12-28', fim: '2027-01-03' })
    expect(sem?.contagens).toMatchObject({ concluidos: 1, parciais: 1, semRegistro: 5 })
    expect(r.meses.map((m) => m.chave)).toEqual(['2026-12', '2027-01'])
  })
})

describe('gráfico de quantidade', () => {
  it('distingue zero de quantidade não informada e não inventa valores', () => {
    const { diario, evo, leitura } = cenario()
    diario.registrar(leitura, '2026-10-03', reg('concluido', 0)) // zero informado
    diario.registrar(leitura, '2026-10-04', reg('concluido', null)) // só status
    diario.registrar(leitura, '2026-10-05', reg('parcial', 7))
    const g = evo.obter(consulta(leitura)).grafico
    const por = new Map((g?.dias ?? []).map((d) => [d.data, d]))
    expect(g?.unidade).toBe('páginas')
    expect(por.get('2026-10-03')?.quantidade).toBe(0)
    expect(por.get('2026-10-04')?.quantidade).toBeNull()
    expect(por.get('2026-10-04')?.status).toBe('concluido')
    expect(por.get('2026-10-06')?.quantidade).toBeNull() // sem registro
    expect(por.get('2026-10-05')).toMatchObject({ quantidade: 7, meta: 10 })
  })

  it('quantidade não define status: muito feito com "não realizada" segue sendo não realizada', () => {
    const { diario, evo, leitura } = cenario()
    diario.registrar(leitura, '2026-10-02', reg('nao_realizado', 50))
    diario.registrar(leitura, '2026-10-03', reg('concluido', 1))
    const por = new Map((evo.obter(consulta(leitura)).grafico?.dias ?? []).map((d) => [d.data, d]))
    expect(por.get('2026-10-02')).toMatchObject({ estado: 'nao_realizado', quantidade: 50 })
    expect(por.get('2026-10-03')).toMatchObject({ estado: 'concluido', quantidade: 1 })
  })

  it('termina ontem (hoje fora), respeita o período e acompanha metas históricas', () => {
    const { itens, diario, evo, leitura } = cenario()
    diario.registrar(leitura, '2026-10-10', reg('concluido', 99)) // hoje: fora do gráfico
    itens.definirProgramacao(leitura, semana(20), '2026-10-10')
    const g = evo.obter(consulta(leitura, '2026-10', '7d')).grafico
    expect(g?.dias[0]?.data).toBe('2026-10-03')
    expect(g?.dias.at(-1)?.data).toBe('2026-10-09')
    expect(g?.dias.every((d) => d.meta === 10)).toBe(true)
    expect(g?.truncado).toBe(false)
  })

  it('limita a 180 dias e sinaliza truncamento', () => {
    hoje = '2025-01-01'
    const c = montar()
    const { id } = c.itens.criar(novo('Longa', 'x'))
    hoje = '2026-10-10'
    const g = c.evo.obter(consulta(id)).grafico
    expect(g?.dias).toHaveLength(180)
    expect(g?.truncado).toBe(true)
    expect(g?.dias.at(-1)?.data).toBe('2026-10-09')
  })
})

describe('consistência dos comparativos com as estatísticas da etapa 5', () => {
  it('semanas e meses somam exatamente as contagens do período', () => {
    const { diario, est, evo, leitura } = cenario()
    diario.registrar(leitura, '2026-10-01', reg('concluido', 10))
    diario.registrar(leitura, '2026-10-02', reg('parcial', 4))
    diario.registrar(leitura, '2026-10-05', reg('nao_realizado', null))
    diario.definirDescanso(leitura, '2026-10-07', null)
    diario.registrar(leitura, '2026-10-07', reg('concluido', 6)) // prática em descanso
    diario.registrar(leitura, '2026-10-10', reg('concluido', 10)) // hoje: fora

    const r = evo.obter(consulta(leitura))
    const e5 = est.obter('completo').atividades.find((a) => a.itemId === leitura)
    expect(r.resumo.contagens).toEqual(e5?.contagens)
    expect(r.resumo.consistencia).toBe(e5?.consistencia)
    expect(r.resumo.cumprimento).toBe(e5?.cumprimento)
    expect(r.resumo.quantidadeTotal).toBe(e5?.quantidadeTotal)

    for (const blocos of [r.semanas, r.meses]) {
      const soma = (k: 'previstos' | 'concluidos' | 'parciais' | 'naoRealizados' | 'semRegistro' | 'descansos' | 'praticaEmDescanso') =>
        blocos.reduce((s, b) => s + b.contagens[k], 0)
      expect(soma('previstos')).toBe(e5?.contagens.previstos)
      expect(soma('concluidos')).toBe(e5?.contagens.concluidos)
      expect(soma('parciais')).toBe(e5?.contagens.parciais)
      expect(soma('naoRealizados')).toBe(e5?.contagens.naoRealizados)
      expect(soma('semRegistro')).toBe(e5?.contagens.semRegistro)
      expect(soma('descansos')).toBe(e5?.contagens.descansos)
      expect(soma('praticaEmDescanso')).toBe(e5?.contagens.praticaEmDescanso)
    }
    // semana de 05/10 a 11/10: 05 não realizada, 06 sem registro, 07 descanso (praticado), 08-09 sem registro
    const s = r.semanas.find((b) => b.chave === '2026-10-05')
    expect(s?.contagens).toMatchObject({ previstos: 4, naoRealizados: 1, semRegistro: 3, descansos: 1, praticaEmDescanso: 1 })
    expect(s?.consistencia).toBe(0)
  })

  it('"todas as atividades": só comparativos; sem calendário e sem somar unidades', () => {
    const { diario, est, evo, leitura, violao } = cenario()
    diario.registrar(leitura, '2026-10-02', reg('concluido', 10))
    diario.registrar(violao, '2026-10-02', reg('concluido', 30))
    const r = evo.obter(consulta(null))
    expect(r.calendario).toBeNull()
    expect(r.grafico).toBeNull()
    expect(r.resumo.quantidadeTotal).toBeNull()
    expect(r.resumo.contagens.previstos).toBe(est.obter('completo').geral.contagens.previstos)
    const totalSemanas = r.semanas.reduce((s, b) => s + b.contagens.previstos, 0)
    expect(totalSemanas).toBe(r.resumo.contagens.previstos)
  })

  it('arquivada para de contar no arquivamento; atividade nova sem histórico fica sem blocos', () => {
    const { itens, evo, leitura } = cenario()
    hoje = '2026-10-05'
    itens.arquivar(leitura)
    hoje = '2026-10-10'
    const r = evo.obter(consulta(leitura))
    expect(r.resumo.janela).toEqual({ inicio: '2026-10-01', fim: '2026-10-04' })
    expect(r.calendario?.find((d) => d.data === '2026-10-06')?.estado).toBe('arquivada')
    expect(r.semanas.reduce((s, b) => s + b.contagens.previstos, 0)).toBe(4)

    hoje = '2026-10-10'
    const nova = itens.criar(novo('Nova', 'x'))
    const rn = evo.obter(consulta(nova.id))
    expect(rn.resumo.janela).toBeNull()
    expect(rn.semanas).toEqual([])
    expect(rn.meses).toEqual([])
    expect(rn.resumo.consistencia).toBeNull()
    expect(rn.grafico?.dias).toEqual([])
  })

  it('não grava nada e persiste: mesmo resultado após reabrir o banco', () => {
    const caminho = join(pasta, 'evolucao.db')
    const a = cenario(caminho)
    a.diario.registrar(a.leitura, '2026-10-03', reg('concluido', 12))
    a.diario.definirDescanso(a.leitura, '2026-10-04', 'x')
    const antesRegistros = a.db.prepare('SELECT * FROM registro').all()
    const antes = a.evo.obter(consulta(a.leitura))
    expect(a.db.prepare('SELECT * FROM registro').all()).toEqual(antesRegistros)
    a.db.close()

    const b = montar(caminho)
    expect(b.evo.obter(consulta(a.leitura))).toEqual(antes)
    b.db.close()
  })
})

describe('validarConsultaEvolucao', () => {
  it('aceita itemId nulo ou válido, mês AAAA-MM e período conhecido', () => {
    expect(validarConsultaEvolucao({ itemId: null, mes: '2026-10', periodo: '30d' })).toEqual({
      itemId: null,
      mes: '2026-10',
      periodo: '30d'
    })
    expect(validarConsultaEvolucao({ itemId: 3, mes: '2027-01', periodo: 'completo' }).itemId).toBe(3)
  })

  it.each([
    [{ itemId: 0, mes: '2026-10', periodo: '7d' }],
    [{ itemId: 1, mes: '2026-13', periodo: '7d' }],
    [{ itemId: 1, mes: '2026-1', periodo: '7d' }],
    [{ itemId: 1, mes: '2026-10-01', periodo: '7d' }],
    [{ itemId: 1, mes: '2026-10', periodo: '1d' }],
    [null]
  ])('rejeita %j', (entrada) => {
    expect(() => validarConsultaEvolucao(entrada)).toThrow(ErroDominio)
  })

  it('item inexistente gera erro de domínio', () => {
    const { evo } = cenario()
    expect(() => evo.obter(consulta(999))).toThrow(ErroDominio)
  })
})
