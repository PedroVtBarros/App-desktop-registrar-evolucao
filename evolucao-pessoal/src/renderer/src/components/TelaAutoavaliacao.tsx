import { useCallback, useEffect, useState } from 'react'
import { hojeIso } from '../../../core/datas'
import {
  LIMITE_OBSERVACAO_AVALIACAO,
  NOTA_MAX,
  NOTA_MIN,
  type Avaliacao,
  type HabilidadeAvaliada,
  type HistoricoHabilidade
} from '../../../shared/avaliacao'
import type { ErroApi } from '../../../shared/item'
import { formatarData } from '../numero'
import { GraficoNotas } from './GraficoNotas'

const NOTAS = Array.from({ length: NOTA_MAX - NOTA_MIN + 1 }, (_, i) => NOTA_MIN + i)

function Variacao({ valor }: { valor: number | null }): React.JSX.Element {
  if (valor === null) {
    return <span className="text-xs text-slate-500">primeira avaliação</span>
  }
  if (valor > 0) {
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">▲ +{valor}</span>
  }
  if (valor < 0) {
    return <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-800">▼ {valor}</span>
  }
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">= sem mudança</span>
}

function ListaHabilidades(p: {
  habilidades: HabilidadeAvaliada[]
  onAbrir: (id: number) => void
}): React.JSX.Element {
  if (p.habilidades.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Nenhuma habilidade cadastrada. A autoavaliação vale só para habilidades; cadastre uma na aba "Atividades"
        escolhendo o tipo "Habilidade".
      </p>
    )
  }
  return (
    <ul className="mt-3 space-y-3">
      {p.habilidades.map((h) => (
        <li
          key={h.itemId}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-4 ${
            h.arquivada ? 'border-slate-200 opacity-80' : 'border-slate-300'
          }`}
        >
          <div>
            <h3 className="font-medium">
              {h.nome}
              {h.arquivada && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
                  Arquivada · somente consulta
                </span>
              )}
            </h3>
            <p className="mt-0.5 text-sm text-slate-600">
              {h.categoria ? `${h.categoria} · ` : ''}
              {h.ultima ? (
                <>
                  Nota atual: <strong>{h.ultima.nota}/10</strong>{' '}
                  <span className="text-xs text-slate-500">({formatarData(h.ultima.data)})</span>{' '}
                  <Variacao valor={h.variacao} />
                </>
              ) : (
                <span className="text-slate-500">Ainda sem autoavaliação</span>
              )}
            </p>
          </div>
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            onClick={() => p.onAbrir(h.itemId)}
          >
            {h.arquivada ? 'Ver histórico' : h.ultima ? 'Avaliar / histórico' : 'Avaliar'}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Detalhe(p: { itemId: number; onVoltar: () => void; onMudou: () => void }): React.JSX.Element {
  const [hist, setHist] = useState<HistoricoHabilidade | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const hoje = hojeIso()
  const [data, setData] = useState(hoje)
  const [nota, setNota] = useState<number | null>(null)
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async (): Promise<void> => {
    const r = await window.api.avaliacoes.historico(p.itemId)
    if (r.ok) setHist(r.dados)
    else setAviso(r.erro.mensagem)
  }, [p.itemId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!hist) {
    return (
      <div>
        <button className="text-sm text-indigo-700 hover:underline" onClick={p.onVoltar}>
          ← Habilidades
        </button>
        {aviso ? <p className="mt-3 text-sm text-red-700">{aviso}</p> : <p className="mt-3 text-sm text-slate-500">Carregando…</p>}
      </div>
    )
  }

  const { habilidade, avaliacoes, resumo } = hist
  const existente = avaliacoes.find((a) => a.data === data)

  function editar(a: Avaliacao): void {
    setData(a.data)
    setNota(a.nota)
    setObservacao(a.observacao ?? '')
    setErro(null)
  }

  async function salvar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (nota === null) {
      setErro({ campo: 'nota', mensagem: 'Escolha uma nota de 0 a 10.' })
      return
    }
    setSalvando(true)
    const r = await window.api.avaliacoes.salvar(p.itemId, data, { nota, observacao })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    setErro(null)
    setNota(null)
    setObservacao('')
    await carregar()
    p.onMudou()
  }

  async function remover(a: Avaliacao): Promise<void> {
    const ok = window.confirm(
      `Remover a avaliação de ${formatarData(a.data)} (nota ${a.nota}/10)?\n\nEsta ação não pode ser desfeita.`
    )
    if (!ok) return
    const r = await window.api.avaliacoes.remover(p.itemId, a.data)
    if (!r.ok) {
      setAviso(r.erro.mensagem)
      return
    }
    setAviso(null)
    await carregar()
    p.onMudou()
  }

  const msg = (c: string): React.JSX.Element | null =>
    erro?.campo === c ? <p className="mt-1 text-xs text-red-600">{erro.mensagem}</p> : null

  return (
    <div>
      <button className="text-sm text-indigo-700 hover:underline" onClick={p.onVoltar}>
        ← Habilidades
      </button>
      <h2 className="mt-2 text-lg font-semibold">
        {habilidade.nome}
        {habilidade.arquivada && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
            Arquivada · somente consulta
          </span>
        )}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {resumo.ultima ? (
          <>
            Avaliação mais recente: <strong>{resumo.ultima.nota}/10</strong> em {formatarData(resumo.ultima.data)}{' '}
            <Variacao valor={resumo.variacao} />
          </>
        ) : (
          'Ainda sem autoavaliação.'
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        A nota é sempre escolhida por você: ela não muda com o tempo praticado, a quantidade realizada, a
        consistência ou as metas.
      </p>

      {aviso && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {aviso}
        </p>
      )}

      {!habilidade.arquivada && (
        <form
          onSubmit={(e) => void salvar(e)}
          noValidate
          className="mt-4 space-y-3 rounded-lg border border-slate-300 bg-white p-4"
        >
          <h3 className="font-medium">{existente ? 'Editar avaliação' : 'Nova avaliação'}</h3>
          <label className="block text-xs font-medium text-slate-600">
            Data
            <input
              type="date"
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm"
              value={data}
              min={habilidade.criadoEm}
              max={hoje}
              onChange={(e) => e.target.value && setData(e.target.value)}
            />
            {msg('data')}
          </label>
          {existente && (
            <p className="text-xs text-amber-700">
              Já existe uma avaliação em {formatarData(data)} (nota {existente.nota}/10). Salvar vai substituí-la.
            </p>
          )}

          <div>
            <p className="text-xs font-medium text-slate-600">Nota (0 a 10)</p>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Nota">
              {NOTAS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={nota === n}
                  onClick={() => setNota(n)}
                  className={`h-9 w-9 rounded border text-sm ${
                    nota === n ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {msg('nota')}
          </div>

          <label className="block text-xs font-medium text-slate-600">
            Observação <span className="font-normal text-slate-400">(opcional — por que essa nota?)</span>
            <textarea
              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              rows={2}
              maxLength={LIMITE_OBSERVACAO_AVALIACAO}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            {msg('observacao')}
          </label>

          {erro && !erro.campo && <p className="text-xs text-red-600">{erro.mensagem}</p>}
          <button
            type="submit"
            disabled={salvando}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Salvar avaliação
          </button>
        </form>
      )}

      <h3 className="mt-6 font-medium">Evolução das notas</h3>
      <div className="mt-2 rounded-lg border border-slate-300 bg-white p-4">
        {avaliacoes.length === 0 ? (
          <p className="text-sm text-slate-500">Sem dados: nenhuma avaliação registrada ainda.</p>
        ) : (
          <>
            <GraficoNotas avaliacoes={avaliacoes} />
            <p className="mt-1 text-xs text-slate-500">
              Cada ponto é uma avaliação sua. A linha só liga avaliações consecutivas; não há valores entre elas.
            </p>
          </>
        )}
      </div>

      <h3 className="mt-6 font-medium">Histórico (do mais antigo ao mais recente)</h3>
      {avaliacoes.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nenhuma avaliação.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {avaliacoes.map((a, i) => {
            const anterior = i > 0 ? avaliacoes[i - 1] : undefined
            return (
              <li key={a.data} className="rounded border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="text-slate-500">{formatarData(a.data)}</span> ·{' '}
                    <strong>{a.nota}/10</strong>{' '}
                    <Variacao valor={anterior ? a.nota - anterior.nota : null} />
                  </p>
                  {!habilidade.arquivada && (
                    <span className="flex gap-1">
                      <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                        onClick={() => editar(a)}
                      >
                        Editar
                      </button>
                      <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-red-700 hover:bg-slate-100"
                        onClick={() => void remover(a)}
                      >
                        Remover
                      </button>
                    </span>
                  )}
                </div>
                {a.observacao && <p className="mt-1 whitespace-pre-wrap text-slate-600">“{a.observacao}”</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function TelaAutoavaliacao(): React.JSX.Element {
  const [habilidades, setHabilidades] = useState<HabilidadeAvaliada[] | null>(null)
  const [aberta, setAberta] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async (): Promise<void> => {
    const r = await window.api.avaliacoes.resumo()
    if (r.ok) {
      setHabilidades(r.dados)
      setAviso(null)
    } else {
      setAviso(r.erro.mensagem)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (aviso) {
    return (
      <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
        {aviso}
      </p>
    )
  }
  if (habilidades === null) return <p className="text-sm text-slate-500">Carregando…</p>

  if (aberta !== null) {
    return <Detalhe itemId={aberta} onVoltar={() => setAberta(null)} onMudou={() => void carregar()} />
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Autoavaliação de habilidades</h2>
      <p className="mt-1 text-xs text-slate-500">
        Registre como você percebe seu nível, de 0 a 10. Praticar mais não eleva a nota automaticamente: ela
        reflete só o que você decide.
      </p>
      <ListaHabilidades habilidades={habilidades} onAbrir={setAberta} />
    </section>
  )
}
