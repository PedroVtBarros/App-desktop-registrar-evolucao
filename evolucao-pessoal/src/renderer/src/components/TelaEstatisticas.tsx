import { useEffect, useState } from 'react'
import type {
  Contagens,
  Estatisticas,
  MetricasAtividade,
  PeriodoEstatisticas
} from '../../../shared/estatisticas'
import { formatarData, formatarNumero, formatarPercentual } from '../numero'

const PERIODOS: { id: PeriodoEstatisticas; rotulo: string }[] = [
  { id: '7d', rotulo: 'Últimos 7 dias' },
  { id: '30d', rotulo: 'Últimos 30 dias' },
  { id: '90d', rotulo: 'Últimos 90 dias' },
  { id: 'completo', rotulo: 'Período completo' }
]

function Indicador(p: { rotulo: string; valor: number | null; cor: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-xs font-medium text-slate-600">{p.rotulo}</p>
      <p className="text-2xl font-semibold">
        {p.valor === null ? (
          <span className="text-base font-normal text-slate-400">Sem dados</span>
        ) : (
          formatarPercentual(p.valor)
        )}
      </p>
      <div className="mt-1 h-2 w-full rounded bg-slate-100" aria-hidden>
        <div
          className={`h-2 rounded ${p.cor}`}
          style={{ width: `${Math.max(0, Math.min(100, p.valor ?? 0))}%` }}
        />
      </div>
    </div>
  )
}

function LinhaContagens({ c }: { c: Contagens }): React.JSX.Element {
  const itens: [string, number][] = [
    ['Previstos', c.previstos],
    ['Concluídos', c.concluidos],
    ['Parciais', c.parciais],
    ['Não realizados', c.naoRealizados],
    ['Sem registro', c.semRegistro],
    ['Descanso', c.descansos]
  ]
  return (
    <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-6">
      {itens.map(([rotulo, n]) => (
        <div key={rotulo}>
          <dt className="text-xs text-slate-500">{rotulo}</dt>
          <dd className="font-medium">{n}</dd>
        </div>
      ))}
    </dl>
  )
}

function CartaoAtividade({ a }: { a: MetricasAtividade }): React.JSX.Element {
  return (
    <li className={`rounded-lg border bg-white p-4 ${a.arquivada ? 'border-slate-200 opacity-80' : 'border-slate-300'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium">
          {a.nome}{' '}
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
            {a.tipo === 'habito' ? 'Hábito' : 'Habilidade'}
          </span>
          {a.arquivada && (
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
              Arquivada
            </span>
          )}
        </h3>
        <p className="text-xs text-slate-500">
          {a.janela
            ? `${formatarData(a.janela.inicio)} a ${formatarData(a.janela.fim)}`
            : 'Nenhum dia elegível no período'}
        </p>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Indicador rotulo="Consistência (prática registrada)" valor={a.consistencia} cor="bg-indigo-500" />
        <Indicador rotulo="Cumprimento (concluídos)" valor={a.cumprimento} cor="bg-emerald-500" />
      </div>

      <LinhaContagens c={a.contagens} />

      <p className="mt-3 text-sm text-slate-700">
        Quantidade total realizada:{' '}
        <strong>
          {formatarNumero(a.quantidadeTotal)} {a.unidade}
        </strong>
        {a.diasComQuantidade > 0 && (
          <span className="text-xs text-slate-500"> em {a.diasComQuantidade} dia(s) com quantidade informada</span>
        )}
      </p>
      <p className="mt-1 text-sm text-slate-700">
        Sequência atual: <strong>{a.sequenciaAtual}</strong> dia(s) · Maior sequência:{' '}
        <strong>{a.maiorSequencia}</strong> dia(s)
        <span className="text-xs text-slate-500"> (todo o histórico)</span>
      </p>
      {a.contagens.praticaEmDescanso > 0 && (
        <p className="mt-1 text-xs text-sky-700">
          Praticou em {a.contagens.praticaEmDescanso} dia(s) de descanso (não entra nos percentuais).
        </p>
      )}
    </li>
  )
}

export function TelaEstatisticas(): React.JSX.Element {
  const [periodo, setPeriodo] = useState<PeriodoEstatisticas>('30d')
  const [dados, setDados] = useState<Estatisticas | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    void window.api.estatisticas.obter(periodo).then((r) => {
      if (!ativo) return
      if (r.ok) {
        setDados(r.dados)
        setAviso(null)
      } else {
        setAviso(r.erro.mensagem)
      }
    })
    return () => {
      ativo = false
    }
  }, [periodo])

  const geral = dados?.geral

  return (
    <section>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            aria-pressed={periodo === p.id}
            onClick={() => setPeriodo(p.id)}
            className={`rounded border px-3 py-1.5 text-sm ${
              periodo === p.id
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 hover:bg-slate-100'
            }`}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {aviso && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {aviso}
        </p>
      )}

      {dados && geral && (
        <>
          <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
            <h2 className="text-lg font-semibold">Visão geral</h2>
            <p className="text-xs text-slate-500">
              Dias passados até ontem; o dia de hoje e datas futuras não entram nos percentuais.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Indicador rotulo="Consistência geral" valor={geral.consistencia} cor="bg-indigo-500" />
              <Indicador rotulo="Cumprimento geral" valor={geral.cumprimento} cor="bg-emerald-500" />
            </div>
            <LinhaContagens c={geral.contagens} />
            {geral.contagens.praticaEmDescanso > 0 && (
              <p className="mt-2 text-xs text-sky-700">
                Prática em dias de descanso: {geral.contagens.praticaEmDescanso} (informativo).
              </p>
            )}
          </div>

          <h2 className="mt-6 text-lg font-semibold">Por atividade</h2>
          {dados.atividades.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nenhuma atividade com dias no período.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {dados.atividades.map((a) => (
                <CartaoAtividade key={a.itemId} a={a} />
              ))}
            </ul>
          )}

          <details className="mt-6 rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">Como é calculado</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Consistência</strong> = dias com prática (concluída ou parcial) ÷ dias previstos.{' '}
                <strong>Cumprimento</strong> = dias concluídos ÷ dias previstos.
              </li>
              <li>
                Dia previsto = dia com meta. Descanso (semanal ou excepcional) fica fora, mesmo se você praticou.
              </li>
              <li>"Não realizada" e dia passado sem registro contam como falha. Nada é gravado automaticamente.</li>
              <li>A quantidade informada não define o status nem entra nos percentuais.</li>
              <li>Hoje e datas futuras não entram nos percentuais; nunca se contam dias antes da criação.</li>
              <li>
                Sequências: descanso é neutro; dia previsto sem prática quebra; vale todo o histórico. Hoje conta se
                você já praticou, mas não quebra se ainda não.
              </li>
              <li>
                Atividade arquivada deixa de contar a partir do arquivamento. Se for desarquivada, volta a contar desde
                a criação (o período arquivado não é rastreado).
              </li>
            </ul>
          </details>
        </>
      )}
    </section>
  )
}
