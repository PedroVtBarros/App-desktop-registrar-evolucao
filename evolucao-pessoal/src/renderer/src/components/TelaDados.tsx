import { useCallback, useEffect, useState } from 'react'
import type {
  AnaliseImportacao,
  ContagensBanco,
  EscolhaImportacao,
  IndicadorAntigo,
  InfoDados,
  PreviaRestauracao,
  ResultadoBackup,
  ResultadoImportacao
} from '../../../shared/dados'
import type { TipoItem } from '../../../shared/item'
import type { StatusRegistro } from '../../../shared/registro'
import { formatarData, formatarNumero, parseNumero } from '../numero'

const caixa = 'rounded-lg border border-slate-300 bg-white p-4'
const botao = 'rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50'
const botaoPrimario =
  'rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50'

function Contagens({ c }: { c: ContagensBanco }): React.JSX.Element {
  return (
    <span>
      {c.atividades} atividade(s), {c.registros} registro(s), {c.programacoes} linha(s) de programação,{' '}
      {c.descansos} descanso(s), {c.avaliacoes} autoavaliação(ões)
    </span>
  )
}

// ----------------------------------------------------------------- importação

interface EstadoEscolha {
  importar: boolean
  tipo: TipoItem
  meta: string
  status: StatusRegistro | ''
}

function LinhaIndicador(p: {
  ind: IndicadorAntigo
  escolha: EstadoEscolha
  onChange: (e: EstadoEscolha) => void
}): React.JSX.Element {
  const { ind, escolha } = p
  const bloqueado = ind.situacao === 'bloqueado'
  const selo =
    ind.situacao === 'importavel'
      ? 'bg-emerald-100 text-emerald-800'
      : ind.situacao === 'ja_importado'
        ? 'bg-sky-100 text-sky-800'
        : 'bg-amber-100 text-amber-800'
  const rotulo =
    ind.situacao === 'importavel' ? 'Pode importar' : ind.situacao === 'ja_importado' ? 'Já importado antes' : 'Não será importado'
  const campo = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-100'

  return (
    <li className="rounded border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {ind.nome || '(sem nome)'}{' '}
          <span className="text-xs font-normal text-slate-500">
            {ind.unidade ? `· ${ind.unidade}` : '· sem unidade'} · início {formatarData(ind.dataInicio)} · direção
            antiga: {ind.direcao} (não importada)
          </span>
        </p>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${selo}`}>{rotulo}</span>
      </div>
      {ind.motivos.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
          {ind.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-600">
        Registros: {ind.registros.total} no total · {ind.registros.novos} novos aproveitáveis ·{' '}
        {ind.registros.jaExistentes} já existentes · {ind.registros.incompativeis} incompatíveis
        {ind.registros.motivosIncompativeis.length > 0 && ` (${ind.registros.motivosIncompativeis.join('; ')})`}
      </p>

      {!bloqueado && (
        <div className="mt-2 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-2">
          <label className="flex items-center gap-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={escolha.importar}
              onChange={(e) => p.onChange({ ...escolha, importar: e.target.checked })}
            />
            Importar
          </label>
          {ind.situacao === 'importavel' && (
            <>
              <label className="text-xs font-medium text-slate-600">
                Tipo
                <select
                  className={`${campo} ml-1`}
                  value={escolha.tipo}
                  disabled={!escolha.importar}
                  onChange={(e) => p.onChange({ ...escolha, tipo: e.target.value as TipoItem })}
                >
                  <option value="habito">Hábito</option>
                  <option value="habilidade">Habilidade</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Meta diária {ind.unidade && `(${ind.unidade})`}
                <input
                  className={`${campo} ml-1 w-24`}
                  value={escolha.meta}
                  inputMode="decimal"
                  placeholder="obrigatória"
                  disabled={!escolha.importar}
                  onChange={(e) => p.onChange({ ...escolha, meta: e.target.value })}
                />
              </label>
            </>
          )}
          <label className="text-xs font-medium text-slate-600">
            Situação dos registros importados
            <select
              className={`${campo} ml-1`}
              value={escolha.status}
              disabled={!escolha.importar || ind.registros.novos === 0}
              onChange={(e) => p.onChange({ ...escolha, status: e.target.value as StatusRegistro | '' })}
            >
              <option value="">Não importar registros</option>
              <option value="concluido">Concluída</option>
              <option value="parcial">Parcialmente realizada</option>
              <option value="nao_realizado">Não realizada</option>
            </select>
          </label>
        </div>
      )}
    </li>
  )
}

function Importacao({ onDadosAlterados }: { onDadosAlterados: () => void }): React.JSX.Element {
  const [analise, setAnalise] = useState<AnaliseImportacao | null>(null)
  const [escolhas, setEscolhas] = useState<Record<number, EstadoEscolha>>({})
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function analisar(): Promise<void> {
    setErro(null)
    setResultado(null)
    setOcupado(true)
    const r = await window.api.dados.analisarImportacao()
    setOcupado(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    if (r.dados.cancelado) return
    const a = r.dados.dados
    setAnalise(a)
    setEscolhas(
      Object.fromEntries(
        a.indicadores.map((i) => [i.idOrigem, { importar: false, tipo: 'habito' as TipoItem, meta: '', status: '' as const }])
      )
    )
  }

  async function importar(): Promise<void> {
    if (!analise) return
    const lista: EscolhaImportacao[] = []
    for (const ind of analise.indicadores) {
      const e = escolhas[ind.idOrigem]
      if (!e || !e.importar) continue
      let metaDiaria: number | null = null
      if (ind.situacao === 'importavel') {
        metaDiaria = parseNumero(e.meta)
        if (metaDiaria === null || metaDiaria <= 0) {
          return setErro(`Informe a meta diária de "${ind.nome}" (número maior que zero) ou desmarque "Importar".`)
        }
      }
      lista.push({
        idOrigem: ind.idOrigem,
        importar: true,
        tipo: e.tipo,
        metaDiaria,
        statusRegistros: e.status === '' ? null : e.status
      })
    }
    if (lista.length === 0) return setErro('Marque ao menos um indicador para importar.')
    setErro(null)
    setOcupado(true)
    const r = await window.api.dados.importar(analise.token, lista)
    setOcupado(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    setResultado(r.dados)
    setAnalise(null)
    onDadosAlterados()
  }

  return (
    <div className={caixa}>
      <h3 className="font-medium">Importar do aplicativo antigo (Evolução 1%)</h3>
      <p className="mt-1 text-xs text-slate-600">
        Importação conservadora: só entram dados com correspondência comprovada. Metas calculadas (+1%), curva
        ideal, valor inicial e direção <strong>não</strong> são importados; status e meta diária são escolhidos
        por você. Nada é gravado até você confirmar, e o banco antigo nunca é alterado.
      </p>
      {!analise && (
        <button className={`${botao} mt-3`} onClick={() => void analisar()} disabled={ocupado}>
          Analisar banco do app antigo…
        </button>
      )}
      {erro && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {resultado && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Importação concluída.</p>
          <p>
            {resultado.atividadesCriadas} atividade(s) criada(s), {resultado.atividadesReaproveitadas}{' '}
            reaproveitada(s); {resultado.registrosImportados} registro(s) importado(s),{' '}
            {resultado.registrosIgnorados} ignorado(s).
          </p>
          <p className="break-all text-xs">Cópia de segurança antes da importação: {resultado.copiaSeguranca}</p>
        </div>
      )}

      {analise && (
        <div className="mt-3">
          <p className="text-sm">
            Arquivo analisado: <span className="break-all font-mono text-xs">{analise.arquivo}</span>
          </p>
          {analise.indicadores.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              O banco antigo não contém nenhum indicador. Nada a importar.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {analise.indicadores.map((ind) => (
                <LinhaIndicador
                  key={ind.idOrigem}
                  ind={ind}
                  escolha={escolhas[ind.idOrigem] ?? { importar: false, tipo: 'habito', meta: '', status: '' }}
                  onChange={(e) => setEscolhas((m) => ({ ...m, [ind.idOrigem]: e }))}
                />
              ))}
            </ul>
          )}
          <details className="mt-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium">Dados do app antigo que não são importados</summary>
            <ul className="mt-1 list-disc pl-5">
              {analise.camposIgnorados.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
          <p className="mt-3 text-xs text-slate-500">
            Os registros importados entram com a situação escolhida e a meta diária informada, desde a data de
            início do indicador. Dias sem registro desde então contarão como "sem registro" nas estatísticas. Um
            backup automático do banco atual é feito antes de importar.
          </p>
          <div className="mt-3 flex gap-2">
            <button className={botaoPrimario} disabled={ocupado} onClick={() => void importar()}>
              Importar selecionados
            </button>
            <button className={botao} disabled={ocupado} onClick={() => setAnalise(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- restauração

function Restauracao(): React.JSX.Element {
  const [previa, setPrevia] = useState<PreviaRestauracao | null>(null)
  const [entendi, setEntendi] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [reiniciando, setReiniciando] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  async function escolher(): Promise<void> {
    setErro(null)
    setEntendi(false)
    setOcupado(true)
    const r = await window.api.dados.escolherRestauracao()
    setOcupado(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    if (r.dados.cancelado) return
    setPrevia(r.dados.dados)
  }

  async function confirmar(): Promise<void> {
    if (!previa) return
    setOcupado(true)
    const r = await window.api.dados.confirmarRestauracao(previa.token)
    if (!r.ok) {
      setOcupado(false)
      setErro(r.erro.mensagem)
      return
    }
    setReiniciando(true)
  }

  if (reiniciando) {
    return (
      <div className={caixa}>
        <p className="text-sm font-medium text-emerald-800">
          Restauração concluída. O aplicativo está reiniciando para carregar os dados restaurados…
        </p>
      </div>
    )
  }

  return (
    <div className={caixa}>
      <h3 className="font-medium">Restaurar backup</h3>
      <p className="mt-1 text-xs text-slate-600">
        Escolha um arquivo de backup do Evolução Pessoal. Antes de qualquer troca, o aplicativo valida o arquivo e
        guarda uma cópia de segurança dos dados atuais. O arquivo escolhido nunca é alterado nem apagado.
      </p>
      {!previa && (
        <button className={`${botao} mt-3`} disabled={ocupado} onClick={() => void escolher()}>
          Escolher backup para restaurar…
        </button>
      )}
      {erro && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {previa && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            Arquivo: <span className="break-all font-mono text-xs">{previa.arquivo}</span>
          </p>
          <p>
            Conteúdo do backup: <Contagens c={previa.contagensBackup} />
            {previa.precisaMigrar && (
              <span className="text-xs text-slate-500">
                {' '}
                — versão anterior (schema {previa.versaoSchemaBackup}); será atualizado com segurança antes de
                aplicar.
              </span>
            )}
          </p>
          <p>
            Dados atuais: <Contagens c={previa.contagensAtuais} />
          </p>
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <p className="font-medium">Atenção: a restauração substituirá os dados atuais.</p>
            <p className="text-xs">
              Uma cópia de segurança dos dados atuais será salva em {previa.pastaCopiaSeguranca}. O aplicativo será
              reiniciado em seguida.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
              Entendo que meus dados atuais serão substituídos por este backup.
            </label>
          </div>
          <div className="flex gap-2">
            <button className={botaoPrimario} disabled={!entendi || ocupado} onClick={() => void confirmar()}>
              Substituir meus dados e reiniciar
            </button>
            <button className={botao} disabled={ocupado} onClick={() => setPrevia(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------- aba

export function TelaDados({ onDadosAlterados }: { onDadosAlterados: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<InfoDados | null>(null)
  const [backup, setBackup] = useState<ResultadoBackup | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregarInfo = useCallback(async (): Promise<void> => {
    const r = await window.api.dados.info()
    if (r.ok) setInfo(r.dados)
  }, [])

  useEffect(() => {
    void carregarInfo()
  }, [carregarInfo])

  async function criarBackup(): Promise<void> {
    setErro(null)
    setBackup(null)
    setOcupado(true)
    const r = await window.api.dados.criarBackup()
    setOcupado(false)
    if (!r.ok) return setErro(r.erro.mensagem)
    if (!r.dados.cancelado) setBackup(r.dados.dados)
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Dados e backup</h2>

      <div className={caixa}>
        <h3 className="font-medium">Onde estão seus dados</h3>
        {info ? (
          <dl className="mt-2 space-y-1 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Banco de dados</dt>
              <dd className="break-all font-mono text-xs">{info.arquivoBanco}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Cópias de segurança automáticas</dt>
              <dd className="break-all font-mono text-xs">{info.pastaBackupsAutomaticos}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Conteúdo atual</dt>
              <dd>
                <Contagens c={info.contagens} />
              </dd>
            </div>
            <div className="text-xs text-slate-500">
              Versão do aplicativo {info.versaoApp} · schema do banco {info.versaoSchema}
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Carregando…</p>
        )}
      </div>

      <div className={caixa}>
        <h3 className="font-medium">Criar backup</h3>
        <p className="mt-1 text-xs text-slate-600">
          Gera uma cópia completa e verificada do banco (atividades, programações, registros, descansos e
          autoavaliações). Guarde o arquivo fora da pasta do aplicativo, por exemplo em Documentos ou em um
          pendrive.
        </p>
        <button className={`${botao} mt-3`} disabled={ocupado} onClick={() => void criarBackup()}>
          Criar backup…
        </button>
        {erro && (
          <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {erro}
          </p>
        )}
        {backup && (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-medium">Backup criado e verificado com sucesso.</p>
            <p className="break-all font-mono text-xs">{backup.caminho}</p>
            <p className="text-xs">
              {formatarNumero(backup.tamanhoBytes / 1024)} KB · <Contagens c={backup.contagens} />
            </p>
          </div>
        )}
      </div>

      <Restauracao />
      <Importacao
        onDadosAlterados={() => {
          void carregarInfo()
          onDadosAlterados()
        }}
      />
    </section>
  )
}
