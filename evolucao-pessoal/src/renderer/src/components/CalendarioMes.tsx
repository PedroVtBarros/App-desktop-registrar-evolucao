import { indiceDiaSemana } from '../../../core/programacao'
import type { DiaSerie, EstadoDia } from '../../../shared/evolucao'
import { descreverDia, ESTADOS } from '../estados'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]
const CABECALHO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const LEGENDA: EstadoDia[] = [
  'concluido', 'parcial', 'nao_realizado', 'sem_registro', 'descanso', 'futuro', 'antes_criacao'
]

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return `${MESES[m - 1] ?? ''} de ${a}`
}

export function deslocarMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Dias que podem abrir a tela de registros: nunca futuros nem anteriores à criação. */
function clicavel(d: DiaSerie): boolean {
  if (d.estado === 'futuro' || d.estado === 'antes_criacao') return false
  if (d.estado === 'arquivada' && d.status === null) return false
  return true
}

interface Props {
  mes: string
  dias: DiaSerie[]
  unidade: string
  mesAtual: string
  onMes: (mes: string) => void
  onAbrirDia: (data: string) => void
}

export function CalendarioMes({ mes, dias, unidade, mesAtual, onMes, onAbrirDia }: Props): React.JSX.Element {
  // Deslocamento da primeira linha (segunda = 0).
  const primeira = dias[0]
  const deslocamento = primeira ? indiceDiaSemana(primeira.data) : 0
  const botao = 'rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={botao} aria-label="Mês anterior" onClick={() => onMes(deslocarMes(mes, -1))}>
          ◀
        </button>
        <h3 className="min-w-40 text-center font-medium capitalize">{rotuloMes(mes)}</h3>
        <button className={botao} aria-label="Próximo mês" onClick={() => onMes(deslocarMes(mes, 1))}>
          ▶
        </button>
        {mes !== mesAtual && (
          <button className={botao} onClick={() => onMes(mesAtual)}>
            Mês atual
          </button>
        )}
      </div>

      <div className="mt-3 grid max-w-md grid-cols-7 gap-1.5" role="grid" aria-label={`Calendário de ${rotuloMes(mes)}`}>
        {CABECALHO.map((c) => (
          <div key={c} className="text-center text-xs text-slate-500">
            {c}
          </div>
        ))}
        {Array.from({ length: deslocamento }, (_, i) => (
          <div key={`v${i}`} />
        ))}
        {dias.map((d) => {
          const est = ESTADOS[d.estado]
          const dia = Number(d.data.slice(8))
          const texto = descreverDia(d, unidade)
          const ok = clicavel(d)
          return (
            <button
              key={d.data}
              type="button"
              disabled={!ok}
              title={texto}
              aria-label={texto}
              onClick={() => onAbrirDia(d.data)}
              className={`relative aspect-square rounded border text-xs ${est.classe} ${
                d.hoje ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
              } ${ok ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
            >
              {dia}
              {d.praticaEmDescanso && (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-600 ring-1 ring-white"
                />
              )}
            </button>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legenda">
        {LEGENDA.map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded border ${ESTADOS[e].classe}`} />
            {ESTADOS[e].rotulo}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-sky-400 bg-sky-200">
            <span className="block h-1.5 w-1.5 translate-x-1.5 translate-y-1.5 rounded-full bg-emerald-600" />
          </span>
          Praticou no descanso
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-slate-400 bg-white ring-2 ring-indigo-500" />
          Hoje
        </li>
      </ul>
    </div>
  )
}
