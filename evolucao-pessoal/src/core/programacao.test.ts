import { describe, expect, it } from 'vitest'
import type { Programacao } from '../shared/item'
import { indiceDiaSemana, metaDoDia } from './programacao'

describe('indiceDiaSemana', () => {
  it('0 = segunda … 6 = domingo', () => {
    expect(indiceDiaSemana('2026-10-12')).toBe(0) // segunda
    expect(indiceDiaSemana('2026-10-15')).toBe(3) // quinta
    expect(indiceDiaSemana('2026-10-18')).toBe(6) // domingo
  })
})

describe('metaDoDia', () => {
  const antiga: Programacao = { vigenteDe: '2026-10-01', metas: [10, 10, 10, 10, 10, 10, 10] }
  const nova: Programacao = { vigenteDe: '2026-10-15', metas: [20, 20, 20, 30, 20, null, null] }

  it('usa a programação vigente na data; dias anteriores seguem a antiga', () => {
    const todas = [nova, antiga] // ordem qualquer
    expect(metaDoDia(todas, '2026-10-14')).toBe(10) // quarta, ainda a antiga
    expect(metaDoDia(todas, '2026-10-15')).toBe(30) // quinta, nova começa hoje
    expect(metaDoDia(todas, '2026-10-12')).toBe(10) // segunda anterior
    expect(metaDoDia(todas, '2026-10-19')).toBe(20) // segunda, nova
  })

  it('distingue descanso (null) de ausência de programação (undefined)', () => {
    const todas = [antiga, nova]
    expect(metaDoDia(todas, '2026-10-17')).toBeNull() // sábado: descanso
    expect(metaDoDia(todas, '2026-09-30')).toBeUndefined() // antes do cadastro
  })
})
