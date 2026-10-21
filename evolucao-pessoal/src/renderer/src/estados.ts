import type { DiaSerie, EstadoDia } from '../../shared/evolucao'
import { formatarData, formatarNumero } from './numero'

/** Aparência e rótulo de cada estado de dia, usados no calendário e na legenda. */
export const ESTADOS: Record<EstadoDia, { rotulo: string; classe: string }> = {
  concluido: { rotulo: 'Concluída', classe: 'bg-emerald-600 text-white border-emerald-700' },
  parcial: { rotulo: 'Parcialmente realizada', classe: 'bg-emerald-200 text-emerald-900 border-emerald-400' },
  nao_realizado: { rotulo: 'Não realizada', classe: 'bg-rose-500 text-white border-rose-600' },
  sem_registro: { rotulo: 'Sem registro', classe: 'bg-amber-50 text-amber-800 border-amber-400 border-dashed' },
  descanso: { rotulo: 'Descanso', classe: 'bg-sky-200 text-sky-900 border-sky-400' },
  pendente: { rotulo: 'Hoje, pendente', classe: 'bg-white text-slate-700 border-slate-400' },
  futuro: { rotulo: 'Dia futuro', classe: 'bg-white text-slate-400 border-slate-200 border-dashed' },
  antes_criacao: { rotulo: 'Antes da criação da atividade', classe: 'bg-slate-100 text-slate-300 border-transparent' },
  arquivada: { rotulo: 'Atividade arquivada', classe: 'bg-slate-200 text-slate-500 border-slate-300' }
}

const ROTULO_STATUS = { concluido: 'Concluída', parcial: 'Parcialmente realizada', nao_realizado: 'Não realizada' }

/** Texto de um dia para dica de ferramenta e leitores de tela. */
export function descreverDia(d: DiaSerie, unidade: string): string {
  const partes = [formatarData(d.data), ESTADOS[d.estado].rotulo]
  if (d.estado === 'descanso') {
    partes[1] = d.descansoExcepcional ? 'Descanso excepcional' : 'Descanso da programação semanal'
    if (d.status) partes.push(`Registrado: ${ROTULO_STATUS[d.status]}`)
    if (d.praticaEmDescanso) partes.push('Praticou em dia de descanso')
  }
  if (d.estado === 'futuro' && d.meta === null) {
    partes.push(d.descansoExcepcional ? 'Descanso excepcional agendado' : 'Descanso na programação semanal')
  }
  if (d.hoje) partes.push('hoje')
  if (d.meta !== null && d.estado !== 'antes_criacao') {
    partes.push(`Meta: ${formatarNumero(d.meta)} ${unidade}`)
  }
  if (d.status !== null) {
    if (d.quantidade === null) partes.push('Quantidade não informada')
    else partes.push(`Realizado: ${formatarNumero(d.quantidade)} ${unidade}`)
  }
  return partes.join(' · ')
}
