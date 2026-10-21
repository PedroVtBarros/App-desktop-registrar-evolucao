import { useState } from 'react'
import type { ErroApi } from '../../../shared/item'
import {
  LIMITE_MOTIVO,
  LIMITE_OBSERVACAO,
  type AtividadeDia,
  type NovoRegistro,
  type StatusRegistro
} from '../../../shared/registro'
import { formatarNumero, parseNumero } from '../numero'

interface Props {
  atividade: AtividadeDia
  /** A data exibida é o dia de hoje (muda só os rótulos). */
  ehHoje: boolean
  /** Data posterior a hoje: não aceita registro, só descanso. */
  dataFutura: boolean
  onRegistrar: (registro: NovoRegistro) => Promise<ErroApi | null>
  onLimpar: () => Promise<ErroApi | null>
  onDescansar: (motivo: string | null) => Promise<ErroApi | null>
  onRetomar: () => Promise<ErroApi | null>
}

const OPCOES: { status: StatusRegistro; rotulo: string; ativo: string }[] = [
  { status: 'concluido', rotulo: 'Concluída', ativo: 'border-emerald-600 bg-emerald-600 text-white' },
  { status: 'parcial', rotulo: 'Parcial', ativo: 'border-amber-500 bg-amber-500 text-white' },
  { status: 'nao_realizado', rotulo: 'Não realizada', ativo: 'border-rose-600 bg-rose-600 text-white' }
]

const ROTULO_STATUS: Record<StatusRegistro, string> = {
  concluido: 'Concluída',
  parcial: 'Parcialmente realizada',
  nao_realizado: 'Não realizada'
}
const COR_STATUS: Record<StatusRegistro, string> = {
  concluido: 'bg-emerald-100 text-emerald-800',
  parcial: 'bg-amber-100 text-amber-800',
  nao_realizado: 'bg-rose-100 text-rose-800'
}

const campo =
  'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none'
const btnPequeno = 'rounded border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100'

const comoTexto = (n: number | null | undefined): string =>
  n == null ? '' : String(n).replace('.', ',')

export function AtividadeDiaCard(p: Props): React.JSX.Element {
  const { atividade, ehHoje, dataFutura } = p
  const { registro, meta, unidade, situacao, arquivada, descansoExcepcional } = atividade
  const [aberto, setAberto] = useState(false)
  const [descansando, setDescansando] = useState(false)
  const [motivo, setMotivo] = useState(descansoExcepcional?.motivo ?? '')
  const [status, setStatus] = useState<StatusRegistro | null>(registro?.status ?? null)
  const [valor, setValor] = useState(comoTexto(registro?.valorRealizado))
  const [observacao, setObservacao] = useState(registro?.observacao ?? '')
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [salvando, setSalvando] = useState(false)

  function abrir(): void {
    setStatus(registro?.status ?? null)
    setValor(comoTexto(registro?.valorRealizado))
    setObservacao(registro?.observacao ?? '')
    setErro(null)
    setAberto(true)
  }

  async function executar(acao: () => Promise<ErroApi | null>, fechar: () => void): Promise<void> {
    setSalvando(true)
    const falha = await acao()
    setSalvando(false)
    setErro(falha)
    if (!falha) fechar()
  }

  async function salvar(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (status === null) {
      setErro({ campo: 'status', mensagem: 'Escolha a situação: concluída, parcial ou não realizada.' })
      return
    }
    let valorRealizado: number | null = null
    if (valor.trim() !== '') {
      valorRealizado = parseNumero(valor)
      if (valorRealizado === null) {
        setErro({ campo: 'valorRealizado', mensagem: 'Informe a quantidade como um número.' })
        return
      }
    }
    await executar(
      () => p.onRegistrar({ status, valorRealizado, observacao }),
      () => setAberto(false)
    )
  }

  const msg = (c: string): React.JSX.Element | null =>
    erro?.campo === c ? <p className="mt-1 text-xs text-red-600">{erro.mensagem}</p> : null

  let selo: React.JSX.Element
  if (registro) {
    selo = (
      <span className={`rounded px-2 py-1 text-xs font-medium ${COR_STATUS[registro.status]}`}>
        {ROTULO_STATUS[registro.status]}
      </span>
    )
  } else if (situacao === 'descanso') {
    selo = <span className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800">Descanso</span>
  } else if (situacao === 'futuro') {
    selo = <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">Futuro</span>
  } else if (situacao === 'sem_registro') {
    selo = (
      <span className="rounded border border-dashed border-slate-400 px-2 py-1 text-xs font-medium text-slate-600">
        Sem registro
      </span>
    )
  } else {
    selo = <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Pendente</span>
  }

  return (
    <li className={`rounded-lg border bg-white p-4 ${arquivada ? 'border-slate-200 opacity-80' : 'border-slate-300'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">
            {atividade.nome}{' '}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
              {atividade.tipo === 'habito' ? 'Hábito' : 'Habilidade'}
            </span>
            {arquivada && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
                Arquivada · somente consulta
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {atividade.categoria ? `${atividade.categoria} · ` : ''}
            {meta !== null ? (
              <>
                Meta {ehHoje ? 'de hoje' : 'desta data'}:{' '}
                <strong>
                  {formatarNumero(meta)} {unidade}
                </strong>
              </>
            ) : descansoExcepcional ? (
              <span className="text-sky-700">
                Descanso excepcional{descansoExcepcional.motivo ? `: ${descansoExcepcional.motivo}` : ''} (sem meta)
              </span>
            ) : (
              <span className="text-sky-700">Descanso planejado na programação semanal (sem meta)</span>
            )}
          </p>
          {descansoExcepcional && atividade.metaProgramada !== null && (
            <p className="text-xs text-slate-500">
              Programação semanal previa {formatarNumero(atividade.metaProgramada)} {unidade} neste dia.
            </p>
          )}
        </div>
        <div className="text-right">{selo}</div>
      </div>

      {registro && (
        <div className="mt-2 text-sm text-slate-700">
          <p>
            {(registro.valorRealizado !== null || registro.status !== 'nao_realizado') && (
              <>
                Realizado:{' '}
                {registro.valorRealizado === null ? (
                  <span className="text-slate-500">quantidade não informada</span>
                ) : (
                  <strong>
                    {formatarNumero(registro.valorRealizado)} {unidade}
                  </strong>
                )}
              </>
            )}
            {registro.metaNoDia !== meta && (
              <span className="ml-2 text-xs text-slate-500">
                (meta no momento do registro:{' '}
                {registro.metaNoDia === null
                  ? 'descanso'
                  : `${formatarNumero(registro.metaNoDia)} ${unidade}`}
                )
              </span>
            )}
          </p>
          {registro.observacao && (
            <p className="mt-1 whitespace-pre-wrap text-slate-600">“{registro.observacao}”</p>
          )}
        </div>
      )}

      {!arquivada && !aberto && !descansando && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!dataFutura && (
            <button onClick={abrir} className={btnPequeno}>
              {registro ? 'Editar registro' : meta === null ? 'Registrar mesmo assim' : 'Registrar'}
            </button>
          )}
          {descansoExcepcional ? (
            <button
              disabled={salvando}
              onClick={() => void executar(p.onRetomar, () => setMotivo(''))}
              className={btnPequeno}
            >
              Remover descanso excepcional
            </button>
          ) : (
            atividade.metaProgramada !== null && (
              <button onClick={() => setDescansando(true)} className={btnPequeno}>
                Marcar descanso nesta data
              </button>
            )
          )}
        </div>
      )}

      {descansando && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void executar(
              () => p.onDescansar(motivo.trim() === '' ? null : motivo),
              () => setDescansando(false)
            )
          }}
        >
          <label className="text-xs font-medium text-slate-600">
            Motivo <span className="font-normal text-slate-400">(opcional)</span>
            <input
              className={`${campo} mt-1 block w-64`}
              value={motivo}
              maxLength={LIMITE_MOTIVO}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
            />
          </label>
          <button
            type="submit"
            disabled={salvando}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Confirmar descanso
          </button>
          <button type="button" onClick={() => setDescansando(false)} className={btnPequeno}>
            Cancelar
          </button>
          <p className="basis-full text-xs text-slate-500">
            Vale só para esta data; a programação semanal não muda.
          </p>
          {erro && <p className="basis-full text-xs text-red-600">{erro.mensagem}</p>}
        </form>
      )}

      {aberto && (
        <form
          onSubmit={(e) => void salvar(e)}
          className="mt-3 space-y-3 border-t border-slate-100 pt-3"
          noValidate
        >
          <div>
            <p className="text-xs font-medium text-slate-600">Situação</p>
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Situação">
              {OPCOES.map((o) => (
                <button
                  key={o.status}
                  type="button"
                  aria-pressed={status === o.status}
                  onClick={() => setStatus(o.status)}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    status === o.status ? o.ativo : 'border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
            {msg('status')}
          </div>

          <label className="block text-xs font-medium text-slate-600">
            Quantidade realizada ({unidade}){' '}
            <span className="font-normal text-slate-400">— opcional, pode ser maior ou menor que a meta</span>
            <input
              className={`${campo} mt-1 block w-32`}
              value={valor}
              inputMode="decimal"
              onChange={(e) => setValor(e.target.value)}
            />
            {msg('valorRealizado')}
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Observação <span className="font-normal text-slate-400">(opcional)</span>
            <textarea
              className={`${campo} mt-1 block w-full`}
              rows={2}
              maxLength={LIMITE_OBSERVACAO}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            {msg('observacao')}
          </label>

          {erro && !erro.campo && <p className="text-xs text-red-600">{erro.mensagem}</p>}
          {erro?.campo === 'data' && <p className="text-xs text-red-600">{erro.mensagem}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={salvando}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Salvar registro
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Cancelar
            </button>
            {registro && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => void executar(p.onLimpar, () => setAberto(false))}
                className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Remover registro
              </button>
            )}
          </div>
        </form>
      )}

      {!aberto && !descansando && erro && <p className="mt-2 text-xs text-red-600">{erro.mensagem}</p>}
    </li>
  )
}
