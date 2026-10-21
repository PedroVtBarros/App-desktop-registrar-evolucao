/** Backup, restauração e importação: tipos compartilhados entre main, preload e renderer. */
import type { TipoItem } from './item'
import type { StatusRegistro } from './registro'

export interface ContagensBanco {
  atividades: number
  programacoes: number
  registros: number
  descansos: number
  avaliacoes: number
}

export interface InfoDados {
  pastaDados: string
  arquivoBanco: string
  pastaBackupsAutomaticos: string
  versaoApp: string
  versaoSchema: number
  contagens: ContagensBanco
}

export interface ResultadoBackup {
  caminho: string
  tamanhoBytes: number
  versaoSchema: number
  contagens: ContagensBanco
}

/** `cancelado` = o usuário fechou o diálogo nativo; nada foi feito. */
export type Cancelavel<T> = { cancelado: true } | { cancelado: false; dados: T }

export interface PreviaRestauracao {
  /** Identificador desta prévia; a confirmação precisa devolvê-lo. */
  token: string
  arquivo: string
  versaoSchemaBackup: number
  versaoSchemaApp: number
  /** O backup é de uma versão anterior e será migrado com segurança antes de ser aplicado. */
  precisaMigrar: boolean
  contagensBackup: ContagensBanco
  contagensAtuais: ContagensBanco
  pastaCopiaSeguranca: string
}

export interface ResultadoRestauracao {
  copiaSeguranca: string
  /** O aplicativo é reiniciado em seguida para recarregar os dados. */
  reiniciando: boolean
}

export type SituacaoIndicador = 'importavel' | 'ja_importado' | 'bloqueado'

export interface IndicadorAntigo {
  idOrigem: number
  nome: string
  unidade: string
  /** Informativo: não existe equivalente no modelo atual e não é importado. */
  direcao: string
  dataInicio: string
  valorInicial: number
  situacao: SituacaoIndicador
  motivos: string[]
  registros: {
    total: number
    /** Aproveitáveis e ainda inexistentes no banco atual. */
    novos: number
    jaExistentes: number
    incompativeis: number
    motivosIncompativeis: string[]
  }
}

export interface AnaliseImportacao {
  token: string
  arquivo: string
  indicadores: IndicadorAntigo[]
  /** Dados do app antigo que, por decisão, nunca são importados. */
  camposIgnorados: string[]
}

export interface EscolhaImportacao {
  idOrigem: number
  importar: boolean
  /** Só vale para atividades ainda não importadas. */
  tipo: TipoItem
  /** Meta diária informada pelo usuário (todos os dias); nunca calculada a partir do app antigo. */
  metaDiaria: number | null
  /** Status aplicado a todos os registros importados deste indicador; null = não importar registros. */
  statusRegistros: StatusRegistro | null
}

export interface ResultadoImportacao {
  atividadesCriadas: number
  atividadesReaproveitadas: number
  registrosImportados: number
  registrosIgnorados: number
  copiaSeguranca: string
}
