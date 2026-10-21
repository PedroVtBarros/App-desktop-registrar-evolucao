import type { GraficoQuantidade } from '../../../shared/evolucao'
import { descreverDia } from '../estados'
import { formatarNumero } from '../numero'

const L = 48
const R = 12
const T = 12
const B = 36
const W = 720
const H = 240

/** Arredonda o teto do eixo para um valor "redondo" (1, 2, 5 × 10ⁿ). */
function tetoRedondo(max: number): number {
  if (max <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(max)))
  const f = max / exp
  const base = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return base * exp
}

function dm(dataIso: string): string {
  return `${dataIso.slice(8)}/${dataIso.slice(5, 7)}`
}

/**
 * Quantidade realizada por dia (barras) contra a meta vigente em cada data (linha em degraus).
 * As barras têm uma única cor: a quantidade não é interpretada como sucesso ou fracasso.
 * Zero informado (●) é diferente de registro sem quantidade (×) e de dia sem registro (nada).
 */
export function GraficoQuantidadeSvg({ grafico }: { grafico: GraficoQuantidade }): React.JSX.Element {
  const { dias, unidade } = grafico
  const n = dias.length
  const plotW = W - L - R
  const plotH = H - T - B
  const slot = plotW / Math.max(n, 1)
  const larguraBarra = Math.max(2, Math.min(slot * 0.62, 28))

  const maximo = Math.max(
    0,
    ...dias.map((d) => d.quantidade ?? 0),
    ...dias.map((d) => d.meta ?? 0)
  )
  const teto = tetoRedondo(maximo * 1.05)
  const y = (v: number): number => T + plotH - (v / teto) * plotH
  const x0 = (i: number): number => L + i * slot
  const centro = (i: number): number => x0(i) + slot / 2
  const base = y(0)

  // Linha da meta em degraus; interrompida nos dias sem meta (descanso).
  let caminhoMeta = ''
  let anterior: number | null = null
  dias.forEach((d, i) => {
    if (d.meta === null) {
      anterior = null
      return
    }
    const yy = y(d.meta)
    if (anterior === null) caminhoMeta += `M${x0(i)} ${yy} `
    else caminhoMeta += `L${x0(i)} ${yy} `
    caminhoMeta += `L${x0(i) + slot} ${yy} `
    anterior = d.meta
  })

  const passoRotulo = Math.max(1, Math.ceil(n / 8))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * teto)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Quantidade realizada por dia em ${unidade}, comparada com a meta vigente`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">
            {formatarNumero(t)}
          </text>
        </g>
      ))}

      {dias.map((d, i) =>
        d.estado === 'descanso' ? (
          <rect key={`r${d.data}`} x={x0(i)} y={T} width={slot} height={plotH} fill="#e0f2fe" />
        ) : null
      )}

      {dias.map((d, i) =>
        d.quantidade !== null && d.quantidade > 0 ? (
          <rect
            key={`b${d.data}`}
            x={centro(i) - larguraBarra / 2}
            y={y(d.quantidade)}
            width={larguraBarra}
            height={base - y(d.quantidade)}
            fill="#6366f1"
            opacity={0.9}
          />
        ) : null
      )}

      {caminhoMeta && (
        <path d={caminhoMeta} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" />
      )}

      {dias.map((d, i) => {
        if (d.quantidade === 0) {
          return <circle key={`z${d.data}`} cx={centro(i)} cy={base - 3} r={3} fill="#0f172a" />
        }
        if (d.status !== null && d.quantidade === null) {
          return (
            <text key={`x${d.data}`} x={centro(i)} y={base + 11} textAnchor="middle" fontSize={11} fill="#64748b">
              ×
            </text>
          )
        }
        return null
      })}

      <line x1={L} x2={W - R} y1={base} y2={base} stroke="#94a3b8" strokeWidth={1} />

      {dias.map((d, i) =>
        i % passoRotulo === 0 || i === n - 1 ? (
          <text key={`t${d.data}`} x={centro(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">
            {dm(d.data)}
          </text>
        ) : null
      )}

      {dias.map((d, i) => (
        <rect key={`h${d.data}`} x={x0(i)} y={T} width={slot} height={plotH + 14} fill="transparent">
          <title>{descreverDia(d, unidade)}</title>
        </rect>
      ))}
    </svg>
  )
}

export function LegendaGrafico(): React.JSX.Element {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-indigo-500" /> Quantidade realizada
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 bg-amber-500" /> Meta vigente na data
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-sky-100 ring-1 ring-sky-200" /> Descanso
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-900" /> Zero informado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="text-slate-500">×</span> Registro sem quantidade
      </li>
    </ul>
  )
}
