import { DIAS_NA_SEMANA, type MetaDia, type Programacao } from '../../shared/item'
import { formatarNumero, parseNumero } from './numero'

export const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const DIAS_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export interface DiaEditavel {
  texto: string
  descanso: boolean
}

/** Estado do editor de programação semanal (valores ainda como texto digitado). */
export interface EstadoSemana {
  igual: boolean
  textoIgual: string
  dias: DiaEditavel[]
}

export function estadoVazio(): EstadoSemana {
  return {
    igual: true,
    textoIgual: '',
    dias: Array.from({ length: DIAS_NA_SEMANA }, () => ({ texto: '', descanso: false }))
  }
}

const comoTexto = (n: number): string => String(n).replace('.', ',')

export function estadoDe(p: Programacao): EstadoSemana {
  const valores = p.metas.filter((m): m is number => m !== null)
  const todosIguais =
    valores.length === DIAS_NA_SEMANA && valores.every((v) => v === valores[0])
  return {
    igual: todosIguais,
    textoIgual: todosIguais && valores[0] !== undefined ? comoTexto(valores[0]) : '',
    dias: p.metas.map((m) => ({ texto: m === null ? '' : comoTexto(m), descanso: m === null }))
  }
}

export function paraMetas(e: EstadoSemana): { metas: MetaDia[] } | { erro: string } {
  if (e.igual) {
    const n = parseNumero(e.textoIgual)
    if (n === null) return { erro: 'Informe a meta como um número.' }
    return { metas: new Array<MetaDia>(DIAS_NA_SEMANA).fill(n) }
  }
  const metas: MetaDia[] = []
  for (const [i, dia] of e.dias.entries()) {
    if (dia.descanso) {
      metas.push(null)
      continue
    }
    const n = parseNumero(dia.texto)
    if (n === null) return { erro: `Informe a meta de ${DIAS[i]} ou marque descanso.` }
    metas.push(n)
  }
  if (metas.every((m) => m === null)) return { erro: 'Defina meta em pelo menos um dia.' }
  return { metas }
}

export function resumoProgramacao(p: Programacao, unidade: string): string {
  const valores = p.metas.filter((m): m is number => m !== null)
  if (valores.length === DIAS_NA_SEMANA && valores.every((v) => v === valores[0])) {
    return `${formatarNumero(valores[0] ?? 0)} ${unidade} todos os dias`
  }
  return p.metas
    .map((m, i) => `${DIAS_CURTO[i]} ${m === null ? 'descanso' : `${formatarNumero(m)} ${unidade}`}`)
    .join(' · ')
}
