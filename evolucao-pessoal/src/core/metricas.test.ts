import { describe, expect, it } from 'vitest'
import type { MetaDia, Programacao } from '../shared/item'
import type { StatusRegistro } from '../shared/registro'
import {
  agregarGeral,
  calcularAtividade,
  type EntradaAtividade,
  type RegistroDia
} from './metricas'

// Calendário usado: 2026-10-01 = quinta. hoje = 2026-10-10 (sábado).
// Janela "completo" de um item criado em 01/10: 01/10 … 09/10 (9 dias, ontem = 09/10).
const HOJE = '2026-10-10'
const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)

type Ent = Partial<Omit<EntradaAtividade, 'registros' | 'descansos'>> & {
  registros?: Record<string, [StatusRegistro, number | null]>
  descansos?: string[]
}

function entrada(p: Ent = {}): EntradaAtividade {
  const registros = new Map<string, RegistroDia>(
    Object.entries(p.registros ?? {}).map(([d, [status, valor]]) => [d, { status, valor }])
  )
  return {
    criadoEm: p.criadoEm ?? '2026-10-01',
    arquivadoEm: p.arquivadoEm ?? null,
    programacoes: p.programacoes ?? [{ vigenteDe: p.criadoEm ?? '2026-10-01', metas: semana(10) }],
    registros,
    descansos: new Set(p.descansos ?? [])
  }
}

/** Registros "concluido" nos dias de outubro informados (ex.: [1, 2, 3]). */
function concluidosEm(dias: number[]): Record<string, [StatusRegistro, number | null]> {
  return Object.fromEntries(
    dias.map((d) => [`2026-10-${String(d).padStart(2, '0')}`, ['concluido', 10] as [StatusRegistro, number]])
  )
}

describe('contagens e percentuais', () => {
  it('dia concluído: previsto, prática e cumprimento', () => {
    const r = calcularAtividade(entrada({ registros: concluidosEm([1, 2, 3, 4, 5, 6, 7, 8, 9]) }), HOJE, 'completo')
    expect(r.janela).toEqual({ inicio: '2026-10-01', fim: '2026-10-09' })
    expect(r.contagens).toMatchObject({ previstos: 9, concluidos: 9, parciais: 0, semRegistro: 0 })
    expect(r.consistencia).toBe(100)
    expect(r.cumprimento).toBe(100)
  })

  it('parcial conta como prática (consistência) mas não como cumprimento', () => {
    const r = calcularAtividade(
      entrada({
        registros: {
          '2026-10-08': ['concluido', 10],
          '2026-10-09': ['parcial', 1]
        },
        criadoEm: '2026-10-08'
      }),
      HOJE,
      'completo'
    )
    expect(r.contagens).toMatchObject({ previstos: 2, concluidos: 1, parciais: 1 })
    expect(r.consistencia).toBe(100)
    expect(r.cumprimento).toBe(50)
  })

  it('"não realizada" e dia passado sem registro são falhas, contadas separadamente', () => {
    const r = calcularAtividade(
      entrada({
        criadoEm: '2026-10-06',
        registros: { '2026-10-06': ['concluido', 10], '2026-10-07': ['nao_realizado', null] }
        // 08 e 09 sem registro
      }),
      HOJE,
      'completo'
    )
    expect(r.contagens).toMatchObject({
      previstos: 4,
      concluidos: 1,
      naoRealizados: 1,
      semRegistro: 2
    })
    expect(r.consistencia).toBe(25)
    expect(r.cumprimento).toBe(25)
  })

  it('descanso semanal fica fora do denominador', () => {
    // sáb (03/10) e dom (04/10) sem meta
    const metas: MetaDia[] = [10, 10, 10, 10, 10, null, null]
    const r = calcularAtividade(
      entrada({ programacoes: [{ vigenteDe: '2026-10-01', metas }], registros: concluidosEm([1, 2, 5, 6, 7, 8, 9]) }),
      HOJE,
      'completo'
    )
    expect(r.contagens).toMatchObject({ previstos: 7, descansos: 2, concluidos: 7 })
    expect(r.consistencia).toBe(100)
  })

  it('descanso excepcional fica fora do denominador', () => {
    const r = calcularAtividade(
      entrada({ descansos: ['2026-10-06'], registros: concluidosEm([1, 2, 3, 4, 5, 7, 8, 9]) }),
      HOJE,
      'completo'
    )
    expect(r.contagens).toMatchObject({ previstos: 8, descansos: 1, concluidos: 8 })
    expect(r.consistencia).toBe(100)
  })

  it('prática em dia de descanso não altera o denominador e aparece à parte', () => {
    const r = calcularAtividade(
      entrada({
        criadoEm: '2026-10-08',
        descansos: ['2026-10-08'],
        registros: { '2026-10-08': ['concluido', 7], '2026-10-09': ['nao_realizado', null] }
      }),
      HOJE,
      'completo'
    )
    expect(r.contagens).toMatchObject({ previstos: 1, descansos: 1, praticaEmDescanso: 1, naoRealizados: 1 })
    expect(r.consistencia).toBe(0) // o dia de descanso praticado não "salva" a consistência
    expect(r.quantidadeTotal).toBe(7) // a quantidade realizada de fato é somada
  })

  it('hoje e datas futuras não entram nos indicadores', () => {
    const r = calcularAtividade(
      entrada({
        criadoEm: '2026-10-09',
        registros: {
          '2026-10-09': ['concluido', 10],
          '2026-10-10': ['nao_realizado', null], // hoje
          '2026-10-11': ['concluido', 10] // futuro
        }
      }),
      HOJE,
      'completo'
    )
    expect(r.janela).toEqual({ inicio: '2026-10-09', fim: '2026-10-09' })
    expect(r.contagens).toMatchObject({ previstos: 1, concluidos: 1, naoRealizados: 0 })
    expect(r.quantidadeTotal).toBe(10)
  })

  it('respeita programações históricas e a vigência de cada uma', () => {
    // De 01/10: todos os dias. A partir de 03/10: sexta vira descanso.
    const programacoes: Programacao[] = [
      { vigenteDe: '2026-10-01', metas: semana(10) },
      { vigenteDe: '2026-10-03', metas: [10, 10, 10, 10, null, 10, 10] }
    ]
    const r = calcularAtividade(entrada({ programacoes }), HOJE, 'completo')
    // sexta 02/10 (antes da mudança) é prevista; sexta 09/10 é descanso.
    expect(r.contagens).toMatchObject({ previstos: 8, descansos: 1, semRegistro: 8 })
  })

  it('item criado recentemente: nunca conta dias anteriores à criação', () => {
    const ontem = calcularAtividade(entrada({ criadoEm: '2026-10-09' }), HOJE, 'completo')
    expect(ontem.janela).toEqual({ inicio: '2026-10-09', fim: '2026-10-09' })
    expect(ontem.contagens.previstos).toBe(1)

    const hoje = calcularAtividade(entrada({ criadoEm: HOJE }), HOJE, 'completo')
    expect(hoje.janela).toBeNull()
    expect(hoje.contagens.previstos).toBe(0)
    expect(hoje.consistencia).toBeNull()
    expect(hoje.cumprimento).toBeNull()
  })

  it('item arquivado não conta a partir do dia do arquivamento', () => {
    const r = calcularAtividade(entrada({ arquivadoEm: '2026-10-05' }), HOJE, 'completo')
    expect(r.janela).toEqual({ inicio: '2026-10-01', fim: '2026-10-04' })
    expect(r.contagens.previstos).toBe(4)

    const arquivadoHoje = calcularAtividade(entrada({ arquivadoEm: HOJE }), HOJE, 'completo')
    expect(arquivadoHoje.janela?.fim).toBe('2026-10-09')
  })

  it('período sem dias previstos: "Sem dados" (null), sem divisão por zero', () => {
    const tudoDescanso = calcularAtividade(
      entrada({ programacoes: [{ vigenteDe: '2026-10-01', metas: [10, null, null, null, null, null, null] }], criadoEm: '2026-10-06' }),
      HOJE,
      'completo'
    ) // 06..09 = ter..sex: todos descanso
    expect(tudoDescanso.contagens).toMatchObject({ previstos: 0, descansos: 4 })
    expect(tudoDescanso.consistencia).toBeNull()
    expect(tudoDescanso.cumprimento).toBeNull()
  })

  it('filtros de período terminam ontem e respeitam a criação', () => {
    const e = entrada()
    expect(calcularAtividade(e, HOJE, '7d').janela).toEqual({ inicio: '2026-10-03', fim: '2026-10-09' })
    expect(calcularAtividade(e, HOJE, '30d').janela).toEqual({ inicio: '2026-10-01', fim: '2026-10-09' })
    expect(calcularAtividade(e, HOJE, '7d').contagens.previstos).toBe(7)
    expect(calcularAtividade(e, HOJE, 'completo').contagens.previstos).toBe(9)
  })

  it('quantidade maior ou menor que a meta não muda o status nem o percentual', () => {
    const r = calcularAtividade(
      entrada({
        criadoEm: '2026-10-07',
        registros: {
          '2026-10-07': ['nao_realizado', 25], // fez muito mas marcou não realizada: segue falha
          '2026-10-08': ['concluido', 2], // fez pouco mas marcou concluída: segue concluída
          '2026-10-09': ['parcial', 40]
        }
      }),
      HOJE,
      'completo'
    )
    expect(r.contagens).toMatchObject({ concluidos: 1, parciais: 1, naoRealizados: 1 })
    expect(r.quantidadeTotal).toBe(67)
    expect(r.diasComQuantidade).toBe(3)
    expect(r.cumprimento).toBeCloseTo(33.33, 1)
    expect(r.consistencia).toBeCloseTo(66.67, 1)
  })
})

describe('sequências', () => {
  it('é interrompida por falha (registro "não realizada" ou sem registro)', () => {
    const r = calcularAtividade(
      entrada({
        registros: {
          ...concluidosEm([1, 2, 3, 4, 5, 7, 8, 9]),
          '2026-10-06': ['nao_realizado', null]
        }
      }),
      HOJE,
      'completo'
    )
    expect(r.maiorSequencia).toBe(5)
    expect(r.sequenciaAtual).toBe(3)

    const semRegistro = calcularAtividade(
      entrada({ registros: concluidosEm([1, 2, 3, 5, 6]) }), // 04, 07, 08, 09 sem registro
      HOJE,
      'completo'
    )
    expect(semRegistro.maiorSequencia).toBe(3)
    expect(semRegistro.sequenciaAtual).toBe(0)
  })

  it('descanso é neutro: não quebra nem soma', () => {
    // qui 01, sex 02 praticados; sáb 03 e dom 04 descanso; seg 05 praticado
    const metas: MetaDia[] = [10, 10, 10, 10, 10, null, null]
    const r = calcularAtividade(
      entrada({
        criadoEm: '2026-10-01',
        programacoes: [{ vigenteDe: '2026-10-01', metas }],
        registros: concluidosEm([1, 2, 5])
      }),
      '2026-10-06', // hoje = terça: janela até 05/10
      'completo'
    )
    expect(r.maiorSequencia).toBe(3)
    expect(r.sequenciaAtual).toBe(3)
  })

  it('prática em dia de descanso não aumenta a sequência', () => {
    const r = calcularAtividade(
      entrada({
        criadoEm: '2026-10-07',
        descansos: ['2026-10-08'],
        registros: concluidosEm([7, 8, 9])
      }),
      HOJE,
      'completo'
    )
    expect(r.maiorSequencia).toBe(2) // 07 e 09; 08 é neutro
    expect(r.sequenciaAtual).toBe(2)
  })

  it('hoje sem prática não quebra a sequência; hoje com prática soma', () => {
    const base = concluidosEm([7, 8, 9])
    const semHoje = calcularAtividade(entrada({ criadoEm: '2026-10-07', registros: base }), HOJE, 'completo')
    expect(semHoje.sequenciaAtual).toBe(3)

    const comHoje = calcularAtividade(
      entrada({ criadoEm: '2026-10-07', registros: { ...base, ...concluidosEm([10]) } }),
      HOJE,
      'completo'
    )
    expect(comHoje.sequenciaAtual).toBe(4)
    expect(comHoje.contagens.previstos).toBe(3) // hoje continua fora do denominador
  })

  it('são calculadas sobre todo o histórico, independente do período', () => {
    const e = entrada({ registros: concluidosEm([1, 2, 3, 4, 5, 6, 7, 8, 9]) })
    const sete = calcularAtividade(e, HOJE, '7d')
    expect(sete.contagens.previstos).toBe(7)
    expect(sete.sequenciaAtual).toBe(9)
    expect(sete.maiorSequencia).toBe(9)
  })
})

describe('agregarGeral', () => {
  it('soma contagens e calcula percentuais gerais; sem dias previstos = null', () => {
    const a = calcularAtividade(entrada({ registros: concluidosEm([1, 2, 3, 4, 5, 6, 7, 8, 9]) }), HOJE, 'completo')
    const b = calcularAtividade(entrada({ criadoEm: '2026-10-08' }), HOJE, 'completo') // 2 dias sem registro
    const geral = agregarGeral([a, b])
    expect(geral.contagens).toMatchObject({ previstos: 11, concluidos: 9, semRegistro: 2 })
    expect(geral.atividadesComDados).toBe(2)
    expect(geral.consistencia).toBeCloseTo(81.82, 1)
    expect(geral.cumprimento).toBeCloseTo(81.82, 1)

    const vazio = agregarGeral([calcularAtividade(entrada({ criadoEm: HOJE }), HOJE, 'completo')])
    expect(vazio.consistencia).toBeNull()
    expect(vazio.atividadesComDados).toBe(0)
    expect(agregarGeral([]).cumprimento).toBeNull()
  })
})
