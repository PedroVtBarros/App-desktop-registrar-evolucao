import type { Comparativo, GranularidadeComparativo } from '../../../shared/evolucao'
import { formatarPercentual } from '../numero'

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function rotulo(b: Comparativo, tipo: GranularidadeComparativo): string {
  if (tipo === 'mes') {
    const [a, m] = b.chave.split('-').map(Number) as [number, number]
    return `${MESES_CURTOS[m - 1]}/${a}`
  }
  const dm = (iso: string): string => `${iso.slice(8)}/${iso.slice(5, 7)}`
  return `${dm(b.inicio)} – ${dm(b.fim)}`
}

interface Props {
  titulo: string
  tipo: GranularidadeComparativo
  blocos: Comparativo[]
  truncado: boolean
  limite: number
}

/** Consistência (barra larga) e cumprimento (barra fina) por bloco, com as regras da etapa 5. */
export function BarrasConsistencia({ titulo, tipo, blocos, truncado, limite }: Props): React.JSX.Element {
  return (
    <div>
      <h3 className="font-medium">{titulo}</h3>
      {blocos.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Sem dados: ainda não há dias passados previstos neste período.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-2">
            {blocos.map((b) => (
              <li key={b.chave} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-sm sm:grid-cols-[8.5rem_1fr_12rem]">
                <span className="text-slate-600">{rotulo(b, tipo)}</span>
                <div className="h-4 rounded bg-slate-100" role="img" aria-label={`Consistência ${b.consistencia === null ? 'sem dados' : formatarPercentual(b.consistencia)}`}>
                  {b.consistencia !== null && (
                    <div className="relative h-4 rounded bg-indigo-500" style={{ width: `${Math.max(1, b.consistencia)}%` }}>
                      {b.cumprimento !== null && (
                        <div
                          className="absolute bottom-0 left-0 h-1.5 rounded bg-emerald-300"
                          style={{ width: `${b.consistencia === 0 ? 0 : (b.cumprimento / b.consistencia) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <span className="col-span-2 text-xs text-slate-600 sm:col-span-1">
                  {b.consistencia === null ? (
                    <span className="text-slate-400">Sem dados</span>
                  ) : (
                    <>
                      <strong>{formatarPercentual(b.consistencia)}</strong> · {b.diasComPratica} de{' '}
                      {b.contagens.previstos} dia(s)
                    </>
                  )}
                  {b.contagens.descansos > 0 && ` · ${b.contagens.descansos} descanso`}
                  {b.contagens.praticaEmDescanso > 0 && ` (praticou em ${b.contagens.praticaEmDescanso})`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Barra grande: consistência (concluída + parcial). Faixa verde: parte concluída (cumprimento).
            {truncado && ` Mostrando os últimos ${limite} blocos.`}
          </p>
        </>
      )}
    </div>
  )
}
