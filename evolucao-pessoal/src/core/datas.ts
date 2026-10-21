const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Data local no formato AAAA-MM-DD. */
export function hojeIso(agora: Date = new Date()): string {
  const m = String(agora.getMonth() + 1).padStart(2, '0')
  const d = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${m}-${d}`
}

/** Soma (ou subtrai) dias a uma data AAAA-MM-DD, sem depender de fuso horário. */
export function somarDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** True se o texto é uma data de calendário real (rejeita 2026-02-30). */
export function dataIsoValida(texto: string): boolean {
  const m = FORMATO_ISO.exec(texto)
  if (!m) return false
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  )
}
