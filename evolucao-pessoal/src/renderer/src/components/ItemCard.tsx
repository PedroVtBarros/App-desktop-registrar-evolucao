import { useState } from 'react'
import { hojeIso } from '../../../core/datas'
import type { ErroApi, Item, MetaDia } from '../../../shared/item'
import { formatarData } from '../numero'
import { estadoDe, paraMetas, resumoProgramacao, type EstadoSemana } from '../semana'
import { EditorSemana } from './EditorSemana'

interface Props {
  item: Item
  onEditar: () => void
  onArquivar: () => void
  onDesarquivar: () => void
  onExcluir: () => void
  onDefinirProgramacao: (metas: MetaDia[], vigenteDe: string) => Promise<ErroApi | null>
}

const btn = 'rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100'

export function ItemCard(p: Props): React.JSX.Element {
  const { item } = p
  const arquivado = item.arquivadoEm !== null
  const [alterando, setAlterando] = useState(false)
  const [semana, setSemana] = useState<EstadoSemana>(() => estadoDe(item.programacaoAtual))
  const [data, setData] = useState(hojeIso())
  const [erro, setErro] = useState<string | null>(null)

  function abrirEdicao(): void {
    if (!alterando) {
      setSemana(estadoDe(item.programacaoAtual))
      setData(hojeIso())
      setErro(null)
    }
    setAlterando((v) => !v)
  }

  async function salvar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const r = paraMetas(semana)
    if ('erro' in r) {
      setErro(r.erro)
      return
    }
    const falha = await p.onDefinirProgramacao(r.metas, data)
    if (falha) {
      setErro(falha.mensagem)
      return
    }
    setAlterando(false)
    setErro(null)
  }

  return (
    <li className={`rounded-lg border bg-white p-4 ${arquivado ? 'border-slate-200 opacity-70' : 'border-slate-300'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">
            {item.nome}{' '}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
              {item.tipo === 'habito' ? 'Hábito' : 'Habilidade'}
            </span>
            {arquivado && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
                Arquivado em {formatarData(item.arquivadoEm ?? '')}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {item.categoria ?? 'Sem categoria'} ·{' '}
            <strong>{resumoProgramacao(item.programacaoAtual, item.unidade)}</strong>
          </p>
          {item.programacoesFuturas.map((f) => (
            <p key={f.vigenteDe} className="text-xs text-indigo-700">
              A partir de {formatarData(f.vigenteDe)}: {resumoProgramacao(f, item.unidade)}
            </p>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {!arquivado && (
            <>
              <button className={btn} onClick={p.onEditar}>
                Editar
              </button>
              <button className={btn} onClick={abrirEdicao}>
                Alterar programação
              </button>
              <button className={btn} onClick={p.onArquivar}>
                Arquivar
              </button>
            </>
          )}
          {arquivado && (
            <>
              <button className={btn} onClick={p.onDesarquivar}>
                Desarquivar
              </button>
              {item.temHistorico || item.temAvaliacoes ? (
                <span className="self-center text-xs text-slate-500">
                  {item.temAvaliacoes
                    ? 'Possui autoavaliações: mantida para preservar o histórico'
                    : 'Possui registros: mantido para preservar o histórico'}
                </span>
              ) : (
                <button className={`${btn} text-red-700`} onClick={p.onExcluir}>
                  Excluir definitivamente
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {alterando && !arquivado && (
        <form
          onSubmit={(e) => void salvar(e)}
          className="mt-3 space-y-3 border-t border-slate-100 pt-3"
          noValidate
        >
          <EditorSemana estado={semana} unidade={item.unidade} onChange={setSemana} />
          <label className="block text-xs">
            A partir de
            <input
              type="date"
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm"
              value={data}
              min={hojeIso()}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            Dias anteriores à data escolhida mantêm a programação atual.
          </p>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <button className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
            Salvar programação
          </button>
        </form>
      )}
    </li>
  )
}
