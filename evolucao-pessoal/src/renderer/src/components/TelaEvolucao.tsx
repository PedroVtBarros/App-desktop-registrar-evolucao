import { useEffect, useState } from 'react'
import type { PeriodoEstatisticas } from '../../../shared/estatisticas'
import { MAX_DIAS_GRAFICO, MAX_MESES, MAX_SEMANAS, type Evolucao } from '../../../shared/evolucao'
import type { Item } from '../../../shared/item'
import { formatarData, formatarNumero, formatarPercentual } from '../numero'
import { BarrasConsistencia } from './BarrasConsistencia'
import { CalendarioMes } from './CalendarioMes'
import { GraficoQuantidadeSvg, LegendaGrafico } from './GraficoQuantidade'

const PERIODOS: { id: PeriodoEstatisticas; rotulo: string }[] = [
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: '90d', rotulo: '90 dias' },
  { id: 'completo', rotulo: 'Completo' }
]

const TODAS = 'todas'

interface Props {
  /** Abre a tela de registros na data escolhida. */
  onAbrirDia: (data: string) => void
}

function Resumo({ dados }: { dados: Evolucao }): React.JSX.Element {
  const { resumo } = dados
  const c = resumo.contagens
  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
      {resumo.consistencia === null ? (
        <p className="text-sm text-slate-500">
          Sem dados: ainda não há dias passados previstos neste período (hoje e datas futuras não entram nas contas).
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Consistência</dt>
            <dd className="text-lg font-semibold">{formatarPercentual(resumo.consistencia)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cumprimento</dt>
            <dd className="text-lg font-semibold">
              {resumo.cumprimento === null ? 'Sem dados' : formatarPercentual(resumo.cumprimento)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Dias previstos</dt>
            <dd className="text-lg font-semibold">{c.previstos}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Descansos</dt>
            <dd className="text-lg font-semibold">
              {c.descansos}
              {c.praticaEmDescanso > 0 && (
                <span className="text-xs font-normal text-slate-500"> ({c.praticaEmDescanso} com prática)</span>
              )}
            </dd>
          </div>
        </dl>
      )}
      {resumo.janela && (
        <p className="mt-2 text-xs text-slate-500">
          Período: {formatarData(resumo.janela.inicio)} a {formatarData(resumo.janela.fim)} · mesmas regras da aba
          Estatísticas.
        </p>
      )}
    </div>
  )
}

export function TelaEvolucao({ onAbrirDia }: Props): React.JSX.Element {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [selecao, setSelecao] = useState<string | null>(null) // id em texto ou TODAS
  const [periodo, setPeriodo] = useState<PeriodoEstatisticas>('30d')
  const [mes, setMes] = useState<string | null>(null)
  const [dados, setDados] = useState<Evolucao | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    void window.api.itens.listar(true).then((r) => {
      if (!r.ok) {
        setAviso(r.erro.mensagem)
        setItens([])
        return
      }
      setItens(r.dados)
      const primeira = r.dados.find((i) => i.arquivadoEm === null) ?? r.dados[0]
      setSelecao(primeira ? String(primeira.id) : null)
    })
  }, [])

  const consultaPronta = itens !== null && itens.length > 0 && selecao !== null
  useEffect(() => {
    if (!consultaPronta || selecao === null || mes === null) return
    let ativo = true
    void window.api.evolucao
      .obter({
        itemId: selecao === TODAS ? null : Number(selecao),
        mes,
        periodo
      })
      .then((r) => {
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
  }, [consultaPronta, selecao, mes, periodo])

  // Mês inicial = mês de hoje (conforme o processo principal), resolvido na primeira consulta.
  useEffect(() => {
    if (mes === null && consultaPronta) {
      void window.api.dia.obter(null).then((r) => {
        if (r.ok) setMes(r.dados.hoje.slice(0, 7))
      })
    }
  }, [mes, consultaPronta])

  if (itens === null) return <p className="text-sm text-slate-500">Carregando…</p>
  if (itens.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhuma atividade ainda. Cadastre hábitos e habilidades na aba "Atividades" para acompanhar a evolução.
      </p>
    )
  }

  const itemSelecionado = itens.find((i) => String(i.id) === selecao)
  const mesAtual = dados?.hoje.slice(0, 7) ?? mes ?? ''

  return (
    <section>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Atividade
          <select
            className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={selecao ?? ''}
            onChange={(e) => setSelecao(e.target.value)}
          >
            {itens.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.nome}
                {i.arquivadoEm !== null ? ' (arquivada)' : ''}
              </option>
            ))}
            <option value={TODAS}>Todas as atividades (só consistência)</option>
          </select>
        </label>
        <div role="group" aria-label="Período" className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              aria-pressed={periodo === p.id}
              onClick={() => setPeriodo(p.id)}
              className={`rounded border px-3 py-1.5 text-sm ${
                periodo === p.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 hover:bg-slate-100'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {aviso}
        </p>
      )}

      {dados && (
        <>
          <Resumo dados={dados} />

          {selecao === TODAS ? (
            <p className="mt-4 rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
              Calendário e quantidades dependem de uma atividade, pois cada uma tem sua unidade (quantidades de
              unidades diferentes nunca são somadas). Escolha uma atividade para vê-los.
            </p>
          ) : (
            <>
              <div className="mt-6">
                <h2 className="text-lg font-semibold">Calendário</h2>
                {dados.calendario && itemSelecionado && (
                  <div className="mt-2 rounded-lg border border-slate-300 bg-white p-4">
                    <CalendarioMes
                      mes={dados.consulta.mes}
                      dias={dados.calendario}
                      unidade={itemSelecionado.unidade}
                      mesAtual={mesAtual}
                      onMes={setMes}
                      onAbrirDia={onAbrirDia}
                    />
                    {dados.resumo.janela === null && (
                      <p className="mt-3 text-xs text-slate-500">
                        Esta atividade ainda não tem dias passados para analisar; o calendário mostra o que está
                        previsto.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <h2 className="text-lg font-semibold">Quantidade realizada × meta</h2>
                <div className="mt-2 rounded-lg border border-slate-300 bg-white p-4">
                  {dados.grafico && dados.grafico.dias.length > 0 ? (
                    <>
                      <GraficoQuantidadeSvg grafico={dados.grafico} />
                      <LegendaGrafico />
                      <p className="mt-2 text-sm text-slate-700">
                        Total no período:{' '}
                        <strong>
                          {formatarNumero(dados.resumo.quantidadeTotal ?? 0)} {dados.grafico.unidade}
                        </strong>
                      </p>
                      {dados.grafico.truncado && (
                        <p className="text-xs text-slate-500">
                          Gráfico dos últimos {MAX_DIAS_GRAFICO} dias; o total considera o período inteiro.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Sem dados: esta atividade não tem dias passados no período escolhido.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="mt-6">
            <h2 className="text-lg font-semibold">Consistência por semana e por mês</h2>
            <div className="mt-2 space-y-6 rounded-lg border border-slate-300 bg-white p-4">
              <BarrasConsistencia
                titulo="Semanas (segunda a domingo)"
                tipo="semana"
                blocos={dados.semanas}
                truncado={dados.semanasTruncado}
                limite={MAX_SEMANAS}
              />
              <BarrasConsistencia
                titulo="Meses"
                tipo="mes"
                blocos={dados.meses}
                truncado={dados.mesesTruncado}
                limite={MAX_MESES}
              />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
