import { NOTA_MAX, type Avaliacao } from '../../../shared/avaliacao'
import { formatarData } from '../numero'

const L = 36
const R = 16
const T = 14
const B = 32
const W = 720
const H = 220

function dias(de: string, ate: string): number {
  const t = (s: string): number => {
    const [a, m, d] = s.split('-').map(Number) as [number, number, number]
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((t(ate) - t(de)) / 86_400_000)
}

/**
 * Evolução das notas ao longo do tempo. Cada ponto é uma avaliação registrada pelo
 * usuário (posição proporcional à data); a linha apenas liga pontos consecutivos,
 * não há valores inventados entre eles. O eixo vai sempre de 0 a 10.
 */
export function GraficoNotas({ avaliacoes }: { avaliacoes: Avaliacao[] }): React.JSX.Element {
  const plotW = W - L - R
  const plotH = H - T - B
  const n = avaliacoes.length
  const primeira = avaliacoes[0]?.data ?? ''
  const ultima = avaliacoes[n - 1]?.data ?? ''
  const span = n > 1 ? Math.max(1, dias(primeira, ultima)) : 1
  const x = (data: string): number => (n > 1 ? L + (dias(primeira, data) / span) * plotW : L + plotW / 2)
  const y = (nota: number): number => T + plotH - (nota / NOTA_MAX) * plotH

  const caminho = avaliacoes.map((a, i) => `${i === 0 ? 'M' : 'L'}${x(a.data)} ${y(a.nota)}`).join(' ')
  const ticks = [0, 2, 4, 6, 8, 10]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Evolução das notas de autoavaliação, de 0 a 10"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">
            {t}
          </text>
        </g>
      ))}

      {n > 1 && <path d={caminho} fill="none" stroke="#a5b4fc" strokeWidth={2} strokeLinejoin="round" />}

      {avaliacoes.map((a) => (
        <g key={a.data}>
          <circle cx={x(a.data)} cy={y(a.nota)} r={5} fill="#4f46e5" stroke="white" strokeWidth={1.5}>
            <title>
              {`${formatarData(a.data)} · nota ${a.nota}/10${a.observacao ? ` · ${a.observacao}` : ''}`}
            </title>
          </circle>
          <text x={x(a.data)} y={y(a.nota) - 9} textAnchor="middle" fontSize={10} fill="#334155">
            {a.nota}
          </text>
        </g>
      ))}

      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />
      {avaliacoes.length > 0 && (
        <>
          <text x={x(primeira)} y={H - 10} textAnchor={n > 1 ? 'start' : 'middle'} fontSize={10} fill="#64748b">
            {formatarData(primeira)}
          </text>
          {n > 1 && (
            <text x={x(ultima)} y={H - 10} textAnchor="end" fontSize={10} fill="#64748b">
              {formatarData(ultima)}
            </text>
          )}
        </>
      )}
    </svg>
  )
}
