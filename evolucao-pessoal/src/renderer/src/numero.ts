/** Converte "1,5" ou "1.5" em número; null se não for um número finito. */
export function parseNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '' || !/^-?\d+(\.\d+)?$/.test(limpo)) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

export function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/** "66,7%" (uma casa decimal, sem zeros inúteis em valores inteiros). */
export function formatarPercentual(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
