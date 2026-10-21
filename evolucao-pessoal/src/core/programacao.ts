import type { MetaDia, Programacao } from '../shared/item'

/** 0 = segunda-feira … 6 = domingo, para uma data AAAA-MM-DD (sem fuso). */
export function indiceDiaSemana(dataIso: string): number {
  const [ano, mes, dia] = dataIso.split('-').map(Number) as [number, number, number]
  const domingoZero = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return (domingoZero + 6) % 7
}

/**
 * Meta de um dia, conforme a programação vigente naquela data.
 * - número: meta do dia
 * - null: descanso planejado
 * - undefined: nenhuma programação vigente (data anterior ao cadastro)
 * Nunca calcula nem ajusta valores: apenas lê o que o usuário definiu.
 */
export function metaDoDia(
  programacoes: readonly Programacao[],
  dataIso: string
): MetaDia | undefined {
  let vigente: Programacao | undefined
  for (const p of programacoes) {
    if (p.vigenteDe <= dataIso && (!vigente || p.vigenteDe > vigente.vigenteDe)) vigente = p
  }
  return vigente?.metas[indiceDiaSemana(dataIso)]
}
