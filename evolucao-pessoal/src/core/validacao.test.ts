import { describe, expect, it } from 'vitest'
import { dataIsoValida, hojeIso } from './datas'
import { ErroDominio } from './erros'
import {
  validarData,
  validarId,
  validarMetas,
  validarNovoItem,
  validarEscolhasImportacao,
  validarNovoRegistro,
  validarPeriodo
} from './validacao'

const semana = (v: number | null): (number | null)[] => new Array<number | null>(7).fill(v)
const base = {
  tipo: 'habito',
  nome: '  Ler  ',
  categoria: ' Estudo ',
  unidade: 'páginas',
  metas: semana(10)
}

function campoDoErro(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDominio)
    return (e as ErroDominio).campo
  }
  expect.unreachable('deveria ter lançado')
}

describe('validarNovoItem', () => {
  it('normaliza textos e aceita entrada válida', () => {
    expect(validarNovoItem(base)).toEqual({
      tipo: 'habito',
      nome: 'Ler',
      categoria: 'Estudo',
      unidade: 'páginas',
      metas: semana(10)
    })
  })

  it('categoria vazia ou ausente vira null', () => {
    expect(validarNovoItem({ ...base, categoria: '   ' }).categoria).toBeNull()
    expect(validarNovoItem({ ...base, categoria: undefined }).categoria).toBeNull()
  })

  it.each([
    ['nome vazio', { nome: '   ' }, 'nome'],
    ['nome muito longo', { nome: 'x'.repeat(81) }, 'nome'],
    ['unidade vazia', { unidade: '' }, 'unidade'],
    ['tipo inválido', { tipo: 'outro' }, 'tipo'],
    ['metas ausentes', { metas: undefined }, 'metas']
  ])('rejeita %s', (_nome, parcial, campo) => {
    expect(campoDoErro(() => validarNovoItem({ ...base, ...parcial }))).toBe(campo)
  })

  it('rejeita entrada que não é objeto', () => {
    expect(() => validarNovoItem(null)).toThrow(ErroDominio)
    expect(() => validarNovoItem('x')).toThrow(ErroDominio)
    expect(() => validarNovoItem([])).toThrow(ErroDominio)
  })
})

describe('validarMetas', () => {
  it('aceita metas diferentes por dia e descanso (null)', () => {
    const metas = [10, 0.5, null, 20, null, 30, 5]
    expect(validarMetas(metas)).toEqual(metas)
  })

  it.each([
    ['tamanho diferente de 7', [10, 10, 10]],
    ['não é lista', 'abc'],
    ['meta zero', [0, 1, 1, 1, 1, 1, 1]],
    ['meta negativa', [-1, 1, 1, 1, 1, 1, 1]],
    ['meta NaN', [Number.NaN, 1, 1, 1, 1, 1, 1]],
    ['meta como texto', ['10', 1, 1, 1, 1, 1, 1]],
    ['meta enorme', [1e9, 1, 1, 1, 1, 1, 1]],
    ['indefinido no lugar de descanso', [undefined, 1, 1, 1, 1, 1, 1]],
    ['todos os dias de descanso', semana(null)]
  ])('rejeita %s', (_nome, entrada) => {
    expect(campoDoErro(() => validarMetas(entrada))).toBe('metas')
  })
})

describe('validarNovoRegistro', () => {
  it('aceita status do usuário com valor maior, menor ou zero', () => {
    expect(validarNovoRegistro({ status: 'concluido', valorRealizado: 150, observacao: ' ok ' })).toEqual({
      status: 'concluido',
      valorRealizado: 150,
      observacao: 'ok'
    })
    expect(validarNovoRegistro({ status: 'parcial', valorRealizado: 0 })).toEqual({
      status: 'parcial',
      valorRealizado: 0,
      observacao: null
    })
    expect(validarNovoRegistro({ status: 'nao_realizado', valorRealizado: null, observacao: '  ' })).toEqual({
      status: 'nao_realizado',
      valorRealizado: null,
      observacao: null
    })
  })

  it('preserva quebras de linha da observação', () => {
    const r = validarNovoRegistro({ status: 'concluido', observacao: 'a\r\nb' })
    expect(r.observacao).toBe('a\nb')
  })

  it.each([
    ['status ausente', { valorRealizado: 1 }, 'status'],
    ['status inválido', { status: 'pendente' }, 'status'],
    ['valor negativo', { status: 'concluido', valorRealizado: -1 }, 'valorRealizado'],
    ['valor NaN', { status: 'concluido', valorRealizado: Number.NaN }, 'valorRealizado'],
    ['valor como texto', { status: 'concluido', valorRealizado: '5' }, 'valorRealizado'],
    ['valor enorme', { status: 'concluido', valorRealizado: 1e9 }, 'valorRealizado'],
    ['observação longa', { status: 'concluido', observacao: 'x'.repeat(501) }, 'observacao'],
    ['observação não texto', { status: 'concluido', observacao: 5 }, 'observacao']
  ])('rejeita %s', (_nome, entrada, campo) => {
    expect(campoDoErro(() => validarNovoRegistro(entrada))).toBe(campo)
  })
})

describe('validarPeriodo', () => {
  it('aceita só os períodos conhecidos', () => {
    for (const p of ['7d', '30d', '90d', 'completo']) expect(validarPeriodo(p)).toBe(p)
    for (const ruim of ['1d', '', null, 7, undefined]) {
      expect(() => validarPeriodo(ruim)).toThrow(ErroDominio)
    }
  })
})

describe('validarId / validarData', () => {
  it('validarId', () => {
    expect(validarId(3)).toBe(3)
    for (const ruim of [0, -1, 1.5, '1', null, undefined]) {
      expect(() => validarId(ruim)).toThrow(ErroDominio)
    }
  })

  it('validarData rejeita datas inexistentes e formatos livres', () => {
    expect(validarData('2026-02-28', 'd')).toBe('2026-02-28')
    for (const ruim of ['2026-02-30', '15/10/2026', '2026-1-1', 20261015, null]) {
      expect(() => validarData(ruim, 'd')).toThrow(ErroDominio)
    }
  })
})

describe('datas', () => {
  it('hojeIso usa a data local', () => {
    expect(hojeIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('dataIsoValida trata ano bissexto', () => {
    expect(dataIsoValida('2028-02-29')).toBe(true)
    expect(dataIsoValida('2027-02-29')).toBe(false)
  })
})

describe('validarEscolhasImportacao', () => {
  const ok = { idOrigem: 1, importar: true, tipo: 'habito', metaDiaria: 20, statusRegistros: 'parcial' }

  it('aceita escolhas válidas, inclusive sem registros e sem meta', () => {
    expect(validarEscolhasImportacao([ok])).toEqual([ok])
    expect(
      validarEscolhasImportacao([{ ...ok, importar: false, metaDiaria: null, statusRegistros: null }])
    ).toHaveLength(1)
  })

  it.each([
    ['não é lista', 'x'],
    ['id inválido', [{ ...ok, idOrigem: 0 }]],
    ['importar não booleano', [{ ...ok, importar: 'sim' }]],
    ['tipo inválido', [{ ...ok, tipo: 'outro' }]],
    ['meta negativa', [{ ...ok, metaDiaria: -1 }]],
    ['meta texto', [{ ...ok, metaDiaria: '5' }]],
    ['status inválido', [{ ...ok, statusRegistros: 'pendente' }]],
    ['id repetido', [ok, ok]]
  ])('rejeita %s', (_nome, entrada) => {
    expect(() => validarEscolhasImportacao(entrada)).toThrow(ErroDominio)
  })
})
