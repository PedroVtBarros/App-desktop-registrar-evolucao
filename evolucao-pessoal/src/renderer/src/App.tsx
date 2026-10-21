import { useCallback, useEffect, useState } from 'react'
import type { ErroApi, Item, Resultado } from '../../shared/item'
import { ItemCard } from './components/ItemCard'
import { ItemForm, type DadosFormulario } from './components/ItemForm'
import { TelaAutoavaliacao } from './components/TelaAutoavaliacao'
import { TelaDados } from './components/TelaDados'
import { TelaDia } from './components/TelaDia'
import { TelaEstatisticas } from './components/TelaEstatisticas'
import { TelaEvolucao } from './components/TelaEvolucao'

const ROTULOS_ABA = {
  hoje: 'Hoje',
  atividades: 'Atividades',
  evolucao: 'Evolução',
  autoavaliacao: 'Autoavaliação',
  dados: 'Dados e backup',
  estatisticas: 'Estatísticas'
} as const

type Modo ={ tela: 'lista' } | { tela: 'novo' } | { tela: 'editar'; item: Item }

export default function App(): React.JSX.Element {
  const [itens, setItens] = useState<Item[]>([])
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  const [aba, setAba] = useState<'hoje' | 'atividades' | 'evolucao' | 'autoavaliacao' | 'estatisticas' | 'dados'>('hoje')
  /** Data escolhida no calendário para abrir na tela de registros (null = hoje). */
  const [dataDia, setDataDia] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>({ tela: 'lista' })
  const [carregando, setCarregando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)

  const recarregar = useCallback(async (): Promise<void> => {
    const r = await window.api.itens.listar(mostrarArquivados)
    if (r.ok) setItens(r.dados)
    else setAviso(r.erro.mensagem)
    setCarregando(false)
  }, [mostrarArquivados])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  /** Executa uma ação; devolve o erro para o formulário/cartão tratar ou recarrega a lista. */
  async function executar<T>(acao: Promise<Resultado<T>>): Promise<ErroApi | null> {
    const r = await acao
    if (!r.ok) return r.erro
    setAviso(null)
    await recarregar()
    return null
  }

  async function executarComAviso(acao: Promise<Resultado<unknown>>): Promise<void> {
    const erro = await executar(acao)
    if (erro) setAviso(erro.mensagem)
  }

  async function salvarNovo(d: DadosFormulario): Promise<ErroApi | null> {
    const erro = await executar(window.api.itens.criar(d))
    if (!erro) setModo({ tela: 'lista' })
    return erro
  }

  async function salvarEdicao(id: number, d: DadosFormulario): Promise<ErroApi | null> {
    const erro = await executar(
      window.api.itens.editar(id, { nome: d.nome, categoria: d.categoria, unidade: d.unidade })
    )
    if (!erro) setModo({ tela: 'lista' })
    return erro
  }

  function excluir(item: Item): void {
    const ok = window.confirm(
      `Excluir "${item.nome}" definitivamente?\n\nEsta ação não pode ser desfeita. Se quiser apenas tirar da lista, mantenha o item arquivado.`
    )
    if (ok) void executarComAviso(window.api.itens.excluir(item.id))
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6 text-slate-800">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Evolução Pessoal</h1>
        {aba === 'atividades' && modo.tela === 'lista' && (
          <button
            onClick={() => setModo({ tela: 'novo' })}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Novo hábito ou habilidade
          </button>
        )}
      </header>

      <nav className="mt-4 flex gap-1 border-b border-slate-200" aria-label="Seções">
        {(['hoje', 'atividades', 'evolucao', 'autoavaliacao', 'estatisticas', 'dados'] as const).map((id) => (
          <button
            key={id}
            onClick={() => {
              if (id === 'hoje') setDataDia(null)
              setAba(id)
            }}
            aria-current={aba === id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
              aba === id
                ? 'border-indigo-600 font-medium text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {ROTULOS_ABA[id]}
          </button>
        ))}
      </nav>

      {aba === 'hoje' && (
        <div className="mt-4">
          <TelaDia key={dataDia ?? 'hoje'} dataInicial={dataDia} />
        </div>
      )}

      {aba === 'evolucao' && (
        <div className="mt-4">
          <TelaEvolucao
            onAbrirDia={(data) => {
              setDataDia(data)
              setAba('hoje')
            }}
          />
        </div>
      )}

      {aba === 'autoavaliacao' && (
        <div className="mt-4">
          <TelaAutoavaliacao />
        </div>
      )}

      {aba === 'dados' && (
        <div className="mt-4">
          <TelaDados onDadosAlterados={() => void recarregar()} />
        </div>
      )}

      {aba === 'estatisticas' && (
        <div className="mt-4">
          <TelaEstatisticas />
        </div>
      )}

      {aba === 'atividades' && aviso && (
        <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {aviso}
        </p>
      )}

      <div className={aba === 'atividades' ? 'mt-4' : 'hidden'}>
        {modo.tela === 'novo' && (
          <ItemForm onSalvar={salvarNovo} onCancelar={() => setModo({ tela: 'lista' })} />
        )}
        {modo.tela === 'editar' && (
          <ItemForm
            inicial={modo.item}
            onSalvar={(d) => salvarEdicao(modo.item.id, d)}
            onCancelar={() => setModo({ tela: 'lista' })}
          />
        )}
      </div>

      {aba === 'atividades' && modo.tela === 'lista' && (
        <section className="mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={mostrarArquivados}
              onChange={(e) => setMostrarArquivados(e.target.checked)}
            />
            Mostrar arquivados
          </label>

          {carregando ? (
            <p className="mt-4 text-sm text-slate-500">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              Nenhum item ainda. Crie seu primeiro hábito ou habilidade.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {itens.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEditar={() => setModo({ tela: 'editar', item })}
                  onArquivar={() => void executarComAviso(window.api.itens.arquivar(item.id))}
                  onDesarquivar={() => void executarComAviso(window.api.itens.desarquivar(item.id))}
                  onExcluir={() => excluir(item)}
                  onDefinirProgramacao={(metas, vigenteDe) =>
                    executar(window.api.itens.definirProgramacao(item.id, metas, vigenteDe))
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
