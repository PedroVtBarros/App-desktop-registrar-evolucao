import { PERIODOS, type PeriodoEstatisticas } from '../shared/estatisticas'
import {
  LIMITE_OBSERVACAO_AVALIACAO,
  NOTA_MAX,
  NOTA_MIN,
  type NovaAvaliacao
} from '../shared/avaliacao'
import type { EscolhaImportacao } from '../shared/dados'
import type { ConsultaEvolucao } from '../shared/evolucao'
import {
  DIAS_NA_SEMANA,
  LIMITES,
  TIPOS_ITEM,
  type EdicaoItem,
  type MetaDia,
  type NovoItem,
  type TipoItem
} from '../shared/item'
import {
  LIMITE_MOTIVO,
  LIMITE_OBSERVACAO,
  STATUS_REGISTRO,
  type NovoRegistro,
  type StatusRegistro
} from '../shared/registro'
import { dataIsoValida } from './datas'
import { ErroDominio } from './erros'

/**
 * Validadores recebem `unknown`: tudo que chega do renderer via IPC é não confiável.
 * Retornam dados normalizados (texto aparado) ou lançam ErroDominio.
 */

function objeto(entrada: unknown): Record<string, unknown> {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ErroDominio('Dados inválidos.')
  }
  return entrada as Record<string, unknown>
}

function textoObrigatorio(valor: unknown, campo: string, rotulo: string, max: number): string {
  if (typeof valor !== 'string') throw new ErroDominio(`${rotulo} é obrigatório.`, campo)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length === 0) throw new ErroDominio(`${rotulo} é obrigatório.`, campo)
  if (texto.length > max) throw new ErroDominio(`${rotulo} deve ter até ${max} caracteres.`, campo)
  return texto
}

function textoOpcional(valor: unknown, campo: string, rotulo: string, max: number): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'string') throw new ErroDominio(`${rotulo} inválido.`, campo)
  const texto = valor.trim().replace(/\s+/g, ' ')
  if (texto.length === 0) return null
  if (texto.length > max) throw new ErroDominio(`${rotulo} deve ter até ${max} caracteres.`, campo)
  return texto
}

export function validarId(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) {
    throw new ErroDominio('Identificador inválido.')
  }
  return valor
}

/** Programação semanal: 7 posições (seg…dom); null = descanso; ao menos um dia com meta. */
export function validarMetas(valor: unknown, campo = 'metas'): MetaDia[] {
  if (!Array.isArray(valor) || valor.length !== DIAS_NA_SEMANA) {
    throw new ErroDominio('Informe a meta (ou descanso) de cada dia da semana.', campo)
  }
  const metas = valor.map((v: unknown, i) => {
    if (v === null) return null
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > LIMITES.metaMaxima) {
      throw new ErroDominio(
        `Meta inválida em ${DIAS_ROTULO[i]}: use um número maior que zero ou marque descanso.`,
        campo
      )
    }
    return v
  })
  if (metas.every((m) => m === null)) {
    throw new ErroDominio('Defina meta em pelo menos um dia da semana.', campo)
  }
  return metas
}

const DIAS_ROTULO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

export function validarData(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !dataIsoValida(valor)) {
    throw new ErroDominio('Data inválida.', campo)
  }
  return valor
}

function validarTipo(valor: unknown): TipoItem {
  if (typeof valor === 'string' && (TIPOS_ITEM as readonly string[]).includes(valor)) {
    return valor as TipoItem
  }
  throw new ErroDominio('Escolha hábito ou habilidade.', 'tipo')
}

export function validarNovoRegistro(entrada: unknown): NovoRegistro {
  const o = objeto(entrada)
  const status = o['status']
  if (typeof status !== 'string' || !(STATUS_REGISTRO as readonly string[]).includes(status)) {
    throw new ErroDominio('Escolha a situação: concluída, parcial ou não realizada.', 'status')
  }

  const v = o['valorRealizado']
  let valorRealizado: number | null = null
  if (v !== null && v !== undefined) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > LIMITES.metaMaxima) {
      throw new ErroDominio(
        `A quantidade realizada deve ser um número entre 0 e ${LIMITES.metaMaxima}.`,
        'valorRealizado'
      )
    }
    valorRealizado = v
  }

  const ob = o['observacao']
  let observacao: string | null = null
  if (ob !== null && ob !== undefined) {
    if (typeof ob !== 'string') throw new ErroDominio('Observação inválida.', 'observacao')
    const texto = ob.replace(/\r\n/g, '\n').trim()
    if (texto.length > LIMITE_OBSERVACAO) {
      throw new ErroDominio(
        `A observação deve ter até ${LIMITE_OBSERVACAO} caracteres.`,
        'observacao'
      )
    }
    observacao = texto === '' ? null : texto
  }

  return { status: status as StatusRegistro, valorRealizado, observacao }
}

export function validarPeriodo(valor: unknown): PeriodoEstatisticas {
  if (typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor)) {
    return valor as PeriodoEstatisticas
  }
  throw new ErroDominio('Período inválido.', 'periodo')
}

const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/

export function validarConsultaEvolucao(entrada: unknown): ConsultaEvolucao {
  const o = objeto(entrada)
  const itemId = o['itemId'] === null ? null : validarId(o['itemId'])
  const mes = o['mes']
  if (typeof mes !== 'string' || !MES_ISO.test(mes)) {
    throw new ErroDominio('Mês inválido.', 'mes')
  }
  return { itemId, mes, periodo: validarPeriodo(o['periodo']) }
}

/** Nota inteira de 0 a 10 (escolhida pelo usuário) e observação opcional. */
export function validarNovaAvaliacao(entrada: unknown): NovaAvaliacao {
  const o = objeto(entrada)
  const nota = o['nota']
  if (typeof nota !== 'number' || !Number.isInteger(nota) || nota < NOTA_MIN || nota > NOTA_MAX) {
    throw new ErroDominio(`A nota deve ser um número inteiro de ${NOTA_MIN} a ${NOTA_MAX}.`, 'nota')
  }
  const ob = o['observacao']
  let observacao: string | null = null
  if (ob !== null && ob !== undefined) {
    if (typeof ob !== 'string') throw new ErroDominio('Observação inválida.', 'observacao')
    const texto = ob.replace(/\r\n/g, '\n').trim()
    if (texto.length > LIMITE_OBSERVACAO_AVALIACAO) {
      throw new ErroDominio(
        `A observação deve ter até ${LIMITE_OBSERVACAO_AVALIACAO} caracteres.`,
        'observacao'
      )
    }
    observacao = texto === '' ? null : texto
  }
  return { nota, observacao }
}

/** Escolhas do usuário na prévia de importação (tudo vindo do renderer é não confiável). */
export function validarEscolhasImportacao(entrada: unknown): EscolhaImportacao[] {
  if (!Array.isArray(entrada) || entrada.length > 500) {
    throw new ErroDominio('Escolhas de importação inválidas.')
  }
  const vistos = new Set<number>()
  return entrada.map((bruto: unknown) => {
    const o = objeto(bruto)
    const idOrigem = validarId(o['idOrigem'])
    if (vistos.has(idOrigem)) throw new ErroDominio('Escolha repetida para o mesmo indicador.')
    vistos.add(idOrigem)
    if (typeof o['importar'] !== 'boolean') throw new ErroDominio('Escolha de importação inválida.')
    const tipo = validarTipo(o['tipo'])
    const meta = o['metaDiaria']
    let metaDiaria: number | null = null
    if (meta !== null && meta !== undefined) {
      if (typeof meta !== 'number' || !Number.isFinite(meta) || meta <= 0 || meta > LIMITES.metaMaxima) {
        throw new ErroDominio('A meta diária deve ser um número maior que zero.', 'metaDiaria')
      }
      metaDiaria = meta
    }
    const st = o['statusRegistros']
    let statusRegistros: StatusRegistro | null = null
    if (st !== null && st !== undefined) {
      if (typeof st !== 'string' || !(STATUS_REGISTRO as readonly string[]).includes(st)) {
        throw new ErroDominio('Situação dos registros importados inválida.', 'statusRegistros')
      }
      statusRegistros = st as StatusRegistro
    }
    return { idOrigem, importar: o['importar'], tipo, metaDiaria, statusRegistros }
  })
}

/** Motivo opcional do descanso excepcional; vazio vira null. */
export function validarMotivo(valor: unknown): string | null {
  return textoOpcional(valor, 'motivo', 'O motivo', LIMITE_MOTIVO)
}

export function validarEdicao(entrada: unknown): EdicaoItem {
  const o = objeto(entrada)
  return {
    nome: textoObrigatorio(o['nome'], 'nome', 'O nome', LIMITES.nome),
    categoria: textoOpcional(o['categoria'], 'categoria', 'A categoria', LIMITES.categoria),
    unidade: textoObrigatorio(o['unidade'], 'unidade', 'A unidade de medida', LIMITES.unidade)
  }
}

export function validarNovoItem(entrada: unknown): NovoItem {
  const o = objeto(entrada)
  return {
    tipo: validarTipo(o['tipo']),
    ...validarEdicao(o),
    metas: validarMetas(o['metas'])
  }
}
