import { DIAS, type EstadoSemana } from '../semana'

interface Props {
  estado: EstadoSemana
  unidade: string
  onChange: (novo: EstadoSemana) => void
}

const input =
  'rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400'

export function EditorSemana({ estado, unidade, onChange }: Props): React.JSX.Element {
  const rotuloUnidade = unidade.trim() === '' ? '' : ` (${unidade.trim()})`

  function alternarIgual(igual: boolean): void {
    if (igual) {
      onChange({ ...estado, igual: true })
      return
    }
    // Ao passar para "por dia", preenche os dias com a meta única já digitada.
    const dias = estado.dias.map((d) => ({ ...d, texto: d.texto || estado.textoIgual }))
    onChange({ ...estado, igual: false, dias })
  }

  return (
    <fieldset className="text-sm">
      <legend className="font-medium">Meta diária{rotuloUnidade}</legend>

      <label className="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={estado.igual}
          onChange={(e) => alternarIgual(e.target.checked)}
        />
        Mesma meta todos os dias
      </label>

      {estado.igual ? (
        <input
          aria-label="Meta diária"
          className={`${input} mt-2 w-32`}
          value={estado.textoIgual}
          inputMode="decimal"
          placeholder="ex.: 30"
          onChange={(e) => onChange({ ...estado, textoIgual: e.target.value })}
        />
      ) : (
        <ul className="mt-2 space-y-1.5">
          {DIAS.map((nome, i) => {
            const dia = estado.dias[i]
            if (!dia) return null
            const atualizar = (parcial: Partial<typeof dia>): void =>
              onChange({
                ...estado,
                dias: estado.dias.map((d, j) => (j === i ? { ...d, ...parcial } : d))
              })
            return (
              <li key={nome} className="flex items-center gap-3">
                <span className="w-20">{nome}</span>
                <input
                  aria-label={`Meta de ${nome}`}
                  className={`${input} w-28`}
                  value={dia.descanso ? '' : dia.texto}
                  disabled={dia.descanso}
                  inputMode="decimal"
                  placeholder={dia.descanso ? 'descanso' : 'meta'}
                  onChange={(e) => atualizar({ texto: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-slate-600">
                  <input
                    type="checkbox"
                    checked={dia.descanso}
                    onChange={(e) => atualizar({ descanso: e.target.checked })}
                  />
                  Descanso
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {!estado.igual && (
        <p className="mt-2 text-xs text-slate-500">
          Dia de descanso é planejado e não exige meta; não é o mesmo que um dia em que a tarefa
          não foi realizada.
        </p>
      )}
    </fieldset>
  )
}
