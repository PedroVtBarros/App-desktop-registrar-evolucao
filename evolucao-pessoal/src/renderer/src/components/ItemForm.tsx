import { useState } from 'react'
import type { ErroApi, Item, MetaDia, TipoItem } from '../../../shared/item'
import { LIMITES } from '../../../shared/item'
import { estadoVazio, paraMetas, type EstadoSemana } from '../semana'
import { EditorSemana } from './EditorSemana'

export interface DadosFormulario {
  tipo: TipoItem
  nome: string
  categoria: string | null
  unidade: string
  metas: MetaDia[]
}

interface Props {
  /** Presente = edição (tipo e programação não são editados aqui). */
  inicial?: Item
  onSalvar: (dados: DadosFormulario) => Promise<ErroApi | null>
  onCancelar: () => void
}

const UNIDADES_SUGERIDAS = ['minutos', 'horas', 'páginas', 'exercícios', 'palavras', 'vezes']

const campoCls =
  'mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none'

export function ItemForm({ inicial, onSalvar, onCancelar }: Props): React.JSX.Element {
  const editando = inicial !== undefined
  const [tipo, setTipo] = useState<TipoItem>(inicial?.tipo ?? 'habito')
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [categoria, setCategoria] = useState(inicial?.categoria ?? '')
  const [unidade, setUnidade] = useState(inicial?.unidade ?? '')
  const [semana, setSemana] = useState<EstadoSemana>(estadoVazio)
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    let metas: MetaDia[] = inicial?.programacaoAtual.metas ?? []
    if (!editando) {
      const r = paraMetas(semana)
      if ('erro' in r) {
        setErro({ campo: 'metas', mensagem: r.erro })
        return
      }
      metas = r.metas
    }
    setSalvando(true)
    const falha = await onSalvar({
      tipo,
      nome,
      categoria: categoria.trim() === '' ? null : categoria,
      unidade,
      metas
    })
    setSalvando(false)
    setErro(falha)
  }

  const msg = (campo: string): React.JSX.Element | null =>
    erro?.campo === campo ? <p className="mt-1 text-xs text-red-600">{erro.mensagem}</p> : null

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="rounded-lg border border-slate-200 bg-white p-4"
      noValidate
    >
      <h2 className="text-lg font-semibold">{editando ? 'Editar item' : 'Novo item'}</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!editando && (
          <label className="text-sm">
            Tipo
            <select
              className={campoCls}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoItem)}
            >
              <option value="habito">Hábito</option>
              <option value="habilidade">Habilidade</option>
            </select>
            {msg('tipo')}
          </label>
        )}

        <label className="text-sm">
          Nome
          <input
            className={campoCls}
            value={nome}
            maxLength={LIMITES.nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
          />
          {msg('nome')}
        </label>

        <label className="text-sm">
          Categoria <span className="text-slate-400">(opcional)</span>
          <input
            className={campoCls}
            value={categoria}
            maxLength={LIMITES.categoria}
            onChange={(e) => setCategoria(e.target.value)}
          />
          {msg('categoria')}
        </label>

        <label className="text-sm">
          Unidade de medida
          <input
            className={campoCls}
            value={unidade}
            maxLength={LIMITES.unidade}
            list="unidades-sugeridas"
            disabled={inicial?.temHistorico === true}
            onChange={(e) => setUnidade(e.target.value)}
          />
          {inicial?.temHistorico === true && (
            <p className="mt-1 text-xs text-slate-500">
              Bloqueada: já existem registros nesta unidade.
            </p>
          )}
          <datalist id="unidades-sugeridas">
            {UNIDADES_SUGERIDAS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          {msg('unidade')}
        </label>
      </div>

      {!editando && (
        <div className="mt-4">
          <EditorSemana estado={semana} unidade={unidade} onChange={setSemana} />
          {msg('metas')}
        </div>
      )}
      {editando && (
        <p className="mt-3 text-xs text-slate-500">
          Para mudar as metas, use "Alterar programação" na lista.
        </p>
      )}

      {erro && !erro.campo && <p className="mt-3 text-sm text-red-600">{erro.mensagem}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
