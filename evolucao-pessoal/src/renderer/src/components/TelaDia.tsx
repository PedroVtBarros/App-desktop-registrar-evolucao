import { useCallback, useEffect, useState } from 'react'
import type { ErroApi, Resultado } from '../../../shared/item'
import type { AtividadeDia, DiaRegistro, NovoRegistro } from '../../../shared/registro'
import { formatarData } from '../numero'
import { AtividadeDiaCard } from './AtividadeDiaCard'

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function nomeDoDia(dataIso: string): string {
  const [a, m, d] = dataIso.split('-').map(Number) as [number, number, number]
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] ?? ''
}

function deslocar(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

const nav = 'rounded border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100'

/** Dia de registro: hoje por padrão, com navegação por datas para consultar e corrigir. */
export function TelaDia({ dataInicial = null }: { dataInicial?: string | null }): React.JSX.Element {
  /** null = hoje. */
  const [data, setData] = useState<string | null>(dataInicial)
  const [dia, setDia] = useState<DiaRegistro | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async (): Promise<void> => {
    const r = await window.api.dia.obter(data)
    if (r.ok) {
      setDia(r.dados)
      setAviso(null)
    } else {
      setAviso(r.erro.mensagem)
    }
  }, [data])

  useEffect(() => {
    void carregar()
    // Se o app ficou aberto na virada do dia, ao voltar à janela a tela se atualiza.
    const aoFocar = (): void => void carregar()
    window.addEventListener('focus', aoFocar)
    return () => window.removeEventListener('focus', aoFocar)
  }, [carregar])

  async function aplicar(r: Resultado<AtividadeDia>): Promise<ErroApi | null> {
    if (!r.ok) return r.erro
    const nova = r.dados
    setDia((atual) =>
      atual
        ? { ...atual, atividades: atual.atividades.map((a) => (a.itemId === nova.itemId ? nova : a)) }
        : atual
    )
    return null
  }

  function irPara(nova: string): void {
    // Digitar a data de hoje volta ao modo "hoje" (acompanha a virada do dia).
    setData(dia && nova === dia.hoje ? null : nova)
  }

  const ehHoje = dia !== null && dia.data === dia.hoje
  const futura = dia !== null && dia.data > dia.hoje

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <button className={nav} aria-label="Dia anterior" disabled={!dia} onClick={() => dia && irPara(deslocar(dia.data, -1))}>
          ◀
        </button>
        <input
          type="date"
          aria-label="Escolher data"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={dia?.data ?? ''}
          onChange={(e) => e.target.value && irPara(e.target.value)}
        />
        <button className={nav} aria-label="Próximo dia" disabled={!dia} onClick={() => dia && irPara(deslocar(dia.data, 1))}>
          ▶
        </button>
        {dia && !ehHoje && (
          <button className={nav} onClick={() => setData(null)}>
            Voltar para hoje
          </button>
        )}
      </div>

      {dia && (
        <h2 className="mt-3 text-lg font-semibold">
          {ehHoje ? 'Hoje' : nomeDoDia(dia.data)}{' '}
          <span className="text-sm font-normal text-slate-500">
            {ehHoje ? `${nomeDoDia(dia.data)}, ` : ''}
            {formatarData(dia.data)}
          </span>
        </h2>
      )}

      {dia && !ehHoje && (
        <p className="mt-1 text-xs text-slate-500">
          {futura
            ? 'Data futura: ainda não há registro nem falha; só é possível agendar descanso.'
            : 'Dia anterior: as metas mostradas são as que valiam nesta data. Alterações corrigem apenas este dia.'}
        </p>
      )}

      {aviso && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {aviso}
        </p>
      )}

      {dia && dia.atividades.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Nenhuma atividade nesta data. Cadastre hábitos e habilidades na aba "Atividades".
        </p>
      )}

      {dia && dia.atividades.length > 0 && (
        <ul className="mt-3 space-y-3">
          {dia.atividades.map((a) => (
            <AtividadeDiaCard
              key={`${dia.data}-${a.itemId}`}
              atividade={a}
              ehHoje={ehHoje}
              dataFutura={futura}
              onRegistrar={async (r: NovoRegistro) =>
                aplicar(await window.api.dia.registrar(a.itemId, dia.data, r))
              }
              onLimpar={async () => aplicar(await window.api.dia.limpar(a.itemId, dia.data))}
              onDescansar={async (motivo) =>
                aplicar(await window.api.dia.definirDescanso(a.itemId, dia.data, motivo))
              }
              onRetomar={async () =>
                aplicar(await window.api.dia.removerDescanso(a.itemId, dia.data))
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}
