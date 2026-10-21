import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { dataIsoValida } from '../core/datas'
import { ErroDominio } from '../core/erros'
import { metaDoDia } from '../core/programacao'
import { LIMITES, type Programacao } from '../shared/item'
import type {
  AnaliseImportacao,
  EscolhaImportacao,
  IndicadorAntigo,
  ResultadoImportacao
} from '../shared/dados'
import { ehArquivoSqlite } from './integridade'

/** Identificador desta origem na tabela importacao_origem. */
export const ORIGEM_APP_PYTHON = 'app-python-v2'

/**
 * O que NUNCA é importado do app antigo, por decisão do usuário e por não ter
 * correspondência comprovada no modelo atual.
 */
export const CAMPOS_IGNORADOS: readonly string[] = [
  'valor_inicial: valor-base da curva de +1%/dia, não é uma observação com data',
  'direcao (aumentar/diminuir): não existe equivalente; o app novo não interpreta melhor/pior',
  'meta do dia, "bateu a meta", curva ideal e sequência: eram calculadas (+1%/dia), não observadas',
  'cor: não existe no modelo atual',
  'tabela interna "meta" (marcador da migração da versão 1 do app antigo)'
]

interface LinhaIndicador {
  id: number
  nome: string
  unidade: string | null
  valor_inicial: number
  direcao: string
  data_inicio: string
}

interface LinhaRegistroAntigo {
  indicador_id: number
  data: string
  valor: number
}

/** Registro antigo já validado, pronto para gravar. */
interface RegistroAproveitavel {
  data: string
  valor: number
}

interface IndicadorInterno extends IndicadorAntigo {
  nomeNormalizado: string
  unidadeNormalizada: string
  chaveOrigem: string
  itemIdExistente: number | null
  aproveitaveis: RegistroAproveitavel[]
}

export interface AnaliseInterna {
  arquivo: string
  indicadores: IndicadorInterno[]
}

const COLUNAS_INDICADORES = ['id', 'nome', 'unidade', 'valor_inicial', 'direcao', 'data_inicio']
const COLUNAS_REGISTROS = ['indicador_id', 'data', 'valor']

function colunas(db: Database.Database, tabela: string): string[] {
  return (db.pragma(`table_info(${tabela})`) as { name: string }[]).map((c) => c.name)
}

function contem(colunasExistentes: string[], exigidas: string[]): boolean {
  return exigidas.every((c) => colunasExistentes.includes(c))
}

function normalizar(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ')
}

export function chaveDaOrigem(nome: string, dataInicio: string): string {
  return `${normalizar(nome).toLowerCase()}|${dataInicio}`
}

function abrirAntigo(caminho: string): Database.Database {
  if (!existsSync(caminho)) {
    throw new ErroDominio('O arquivo do app antigo não foi encontrado.')
  }
  if (!ehArquivoSqlite(caminho)) {
    throw new ErroDominio('O arquivo escolhido não é um banco de dados SQLite.')
  }
  try {
    // Somente leitura: o banco antigo nunca é modificado.
    return new Database(caminho, { readonly: true, fileMustExist: true })
  } catch {
    throw new ErroDominio('Não foi possível abrir o banco do app antigo.')
  }
}

/**
 * Lê o banco do app Python antigo (somente leitura) e classifica o que é aproveitável
 * com segurança. Não escreve em nenhum banco. `atual` é o banco do app novo, usado só
 * para detectar importações anteriores e conflitos de nome.
 */
export function analisarBancoAntigo(
  caminho: string,
  atual: Database.Database,
  hoje: string
): AnaliseInterna {
  const antigo = abrirAntigo(caminho)
  try {
    const integ = antigo.pragma('integrity_check') as { integrity_check: string }[]
    if (integ.length !== 1 || integ[0]?.integrity_check !== 'ok') {
      throw new ErroDominio('O banco do app antigo falhou na verificação de integridade; nada foi lido.')
    }
    if (
      !contem(colunas(antigo, 'indicadores'), COLUNAS_INDICADORES) ||
      !contem(colunas(antigo, 'registros'), COLUNAS_REGISTROS)
    ) {
      throw new ErroDominio(
        'O arquivo não tem o formato do app antigo (tabelas "indicadores" e "registros"); nada foi importado.'
      )
    }

    const linhas = antigo
      .prepare(
        'SELECT id, nome, unidade, valor_inicial, direcao, data_inicio FROM indicadores ORDER BY id'
      )
      .all() as LinhaIndicador[]
    const registros = antigo
      .prepare('SELECT indicador_id, data, valor FROM registros ORDER BY indicador_id, data')
      .all() as LinhaRegistroAntigo[]

    const porIndicador = new Map<number, LinhaRegistroAntigo[]>()
    for (const r of registros) {
      const lista = porIndicador.get(r.indicador_id) ?? []
      lista.push(r)
      porIndicador.set(r.indicador_id, lista)
    }

    const consultaMapa = atual.prepare(
      'SELECT item_id, chave_origem FROM importacao_origem WHERE origem = ? AND id_origem = ?'
    )
    const consultaNome = atual.prepare(
      'SELECT id FROM item WHERE arquivado_em IS NULL AND nome = ? COLLATE NOCASE'
    )
    const consultaDatas = atual.prepare('SELECT data FROM registro WHERE item_id = ?')
    const consultaArquivado = atual.prepare('SELECT arquivado_em FROM item WHERE id = ?')

    const nomesVistos = new Set<string>()
    const indicadores: IndicadorInterno[] = linhas.map((l) => {
      const nome = normalizar(String(l.nome ?? ''))
      const unidade = normalizar(String(l.unidade ?? ''))
      const dataInicio = String(l.data_inicio ?? '')
      const motivos: string[] = []
      const chave = chaveDaOrigem(nome, dataInicio)

      let situacao: IndicadorAntigo['situacao'] = 'importavel'
      let itemIdExistente: number | null = null

      const mapa = consultaMapa.get(ORIGEM_APP_PYTHON, l.id) as
        | { item_id: number; chave_origem: string }
        | undefined
      if (mapa) {
        if (mapa.chave_origem === chave) {
          situacao = 'ja_importado'
          itemIdExistente = mapa.item_id
          const arq = consultaArquivado.get(mapa.item_id) as { arquivado_em: string | null } | undefined
          if (arq?.arquivado_em) {
            situacao = 'bloqueado'
            motivos.push('A atividade importada antes está arquivada; desarquive-a para importar novos registros.')
          }
        } else {
          situacao = 'bloqueado'
          motivos.push(
            'O identificador já corresponde a outra atividade importada anteriormente (nome ou data de início diferentes): ambíguo.'
          )
        }
      } else {
        if (nome === '' || nome.length > LIMITES.nome) {
          motivos.push(`Nome vazio ou com mais de ${LIMITES.nome} caracteres.`)
        }
        if (unidade === '') {
          motivos.push('Sem unidade de medida: o app novo exige uma e ela não pode ser inventada.')
        } else if (unidade.length > LIMITES.unidade) {
          motivos.push(`Unidade com mais de ${LIMITES.unidade} caracteres.`)
        }
        if (!dataIsoValida(dataInicio)) {
          motivos.push('Data de início inválida.')
        } else if (dataInicio > hoje) {
          motivos.push('Data de início no futuro.')
        }
        const chaveNome = nome.toLowerCase()
        if (nome !== '' && nomesVistos.has(chaveNome)) {
          motivos.push('Nome repetido no banco antigo: ambíguo.')
        }
        if (nome !== '' && consultaNome.get(nome) !== undefined) {
          motivos.push('Já existe uma atividade ativa com este nome; não foi mesclada para não misturar históricos.')
        }
        if (motivos.length > 0) situacao = 'bloqueado'
      }
      if (nome !== '') nomesVistos.add(nome.toLowerCase())

      // --- registros ---
      const existentes = new Set<string>(
        itemIdExistente !== null
          ? (consultaDatas.all(itemIdExistente) as { data: string }[]).map((r) => r.data)
          : []
      )
      const brutos = porIndicador.get(l.id) ?? []
      const aproveitaveis: RegistroAproveitavel[] = []
      const motivosInc = new Map<string, number>()
      let jaExistentes = 0
      let incompativeis = 0
      const rejeitar = (motivo: string): void => {
        incompativeis += 1
        motivosInc.set(motivo, (motivosInc.get(motivo) ?? 0) + 1)
      }
      for (const r of brutos) {
        const data = String(r.data ?? '')
        const valor = r.valor
        if (!dataIsoValida(data)) rejeitar('data inválida')
        else if (dataIsoValida(dataInicio) && data < dataInicio) rejeitar('data anterior ao início da atividade')
        else if (data > hoje) rejeitar('data no futuro')
        else if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > LIMITES.metaMaxima) {
          rejeitar('quantidade fora do intervalo aceito')
        } else if (existentes.has(data)) jaExistentes += 1
        else aproveitaveis.push({ data, valor })
      }

      return {
        idOrigem: l.id,
        nome,
        unidade,
        direcao: String(l.direcao ?? ''),
        dataInicio,
        valorInicial: l.valor_inicial,
        situacao,
        motivos,
        registros: {
          total: brutos.length,
          novos: aproveitaveis.length,
          jaExistentes,
          incompativeis,
          motivosIncompativeis: [...motivosInc.entries()].map(([m, n]) => `${n} registro(s): ${m}`)
        },
        nomeNormalizado: nome,
        unidadeNormalizada: unidade,
        chaveOrigem: chave,
        itemIdExistente,
        aproveitaveis
      }
    })

    return { arquivo: basename(caminho), indicadores }
  } finally {
    antigo.close()
  }
}

/** Versão da análise enviada ao renderer (sem os dados internos de execução). */
export function paraPrevia(a: AnaliseInterna, token: string): AnaliseImportacao {
  return {
    token,
    arquivo: a.arquivo,
    indicadores: a.indicadores.map((i) => ({
      idOrigem: i.idOrigem,
      nome: i.nome,
      unidade: i.unidade,
      direcao: i.direcao,
      dataInicio: i.dataInicio,
      valorInicial: i.valorInicial,
      situacao: i.situacao,
      motivos: i.motivos,
      registros: i.registros
    })),
    camposIgnorados: [...CAMPOS_IGNORADOS]
  }
}

/**
 * Executa a importação escolhida, em uma única transação (tudo ou nada). Nunca apaga
 * nem substitui dados do banco atual: atividades novas são criadas, registros novos são
 * inseridos (datas já existentes ficam intactas) e metas existentes não são tocadas.
 * A análise é refeita aqui, então só o que é comprovadamente válido é gravado.
 */
export function executarImportacao(
  atual: Database.Database,
  caminho: string,
  escolhas: readonly EscolhaImportacao[],
  hoje: string,
  agora: string,
  copiaSeguranca: string
): ResultadoImportacao {
  const analise = analisarBancoAntigo(caminho, atual, hoje)
  const porId = new Map(analise.indicadores.map((i) => [i.idOrigem, i]))

  for (const e of escolhas) {
    const ind = porId.get(e.idOrigem)
    if (!ind) throw new ErroDominio('Indicador desconhecido na importação.')
    if (!e.importar) continue
    if (ind.situacao === 'bloqueado') {
      throw new ErroDominio(`"${ind.nome}" não pode ser importado: ${ind.motivos.join(' ')}`)
    }
    if (ind.situacao === 'importavel') {
      if (typeof e.metaDiaria !== 'number' || !Number.isFinite(e.metaDiaria) || e.metaDiaria <= 0 || e.metaDiaria > LIMITES.metaMaxima) {
        throw new ErroDominio(`Informe a meta diária de "${ind.nome}" para importá-lo.`)
      }
    }
  }

  const inserirItem = atual.prepare(
    'INSERT INTO item (tipo, nome, categoria, unidade, criado_em) VALUES (?, ?, NULL, ?, ?)'
  )
  const inserirProg = atual.prepare(
    'INSERT INTO programacao_semanal (item_id, vigente_de, dia_semana, valor_alvo) VALUES (?, ?, ?, ?)'
  )
  const inserirMapa = atual.prepare(
    'INSERT INTO importacao_origem (origem, id_origem, chave_origem, item_id, importado_em) VALUES (?, ?, ?, ?, ?)'
  )
  const inserirRegistro = atual.prepare(
    `INSERT INTO registro (item_id, data, status, valor_realizado, meta_no_dia, observacao, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT (item_id, data) DO NOTHING`
  )
  const lerProgramacoes = atual.prepare(
    'SELECT vigente_de, dia_semana, valor_alvo FROM programacao_semanal WHERE item_id = ? ORDER BY vigente_de, dia_semana'
  )

  const resultado: ResultadoImportacao = {
    atividadesCriadas: 0,
    atividadesReaproveitadas: 0,
    registrosImportados: 0,
    registrosIgnorados: 0,
    copiaSeguranca
  }

  atual.transaction(() => {
    for (const e of escolhas) {
      if (!e.importar) continue
      const ind = porId.get(e.idOrigem)
      if (!ind) continue
      let itemId: number
      let metaDoRegistro: (data: string) => number | null

      if (ind.situacao === 'ja_importado' && ind.itemIdExistente !== null) {
        itemId = ind.itemIdExistente
        resultado.atividadesReaproveitadas += 1
        const progs = agruparProgramacoes(
          lerProgramacoes.all(itemId) as { vigente_de: string; dia_semana: number; valor_alvo: number | null }[]
        )
        metaDoRegistro = (data) => metaDoDia(progs, data) ?? null
      } else {
        const meta = e.metaDiaria as number
        const r = inserirItem.run(e.tipo, ind.nomeNormalizado, ind.unidadeNormalizada, ind.dataInicio)
        itemId = Number(r.lastInsertRowid)
        for (let dia = 1; dia <= 7; dia++) inserirProg.run(itemId, ind.dataInicio, dia, meta)
        inserirMapa.run(ORIGEM_APP_PYTHON, ind.idOrigem, ind.chaveOrigem, itemId, agora)
        resultado.atividadesCriadas += 1
        metaDoRegistro = () => meta
      }

      resultado.registrosIgnorados += ind.registros.incompativeis + ind.registros.jaExistentes
      if (e.statusRegistros === null) {
        resultado.registrosIgnorados += ind.aproveitaveis.length
        continue
      }
      for (const reg of ind.aproveitaveis) {
        const r = inserirRegistro.run(
          itemId,
          reg.data,
          e.statusRegistros,
          reg.valor,
          metaDoRegistro(reg.data),
          agora,
          agora
        )
        if (r.changes > 0) resultado.registrosImportados += 1
        else resultado.registrosIgnorados += 1
      }
    }
  })()

  return resultado
}

function agruparProgramacoes(
  linhas: { vigente_de: string; dia_semana: number; valor_alvo: number | null }[]
): Programacao[] {
  const mapa = new Map<string, (number | null)[]>()
  for (const l of linhas) {
    const metas = mapa.get(l.vigente_de) ?? new Array<number | null>(7).fill(null)
    metas[l.dia_semana - 1] = l.valor_alvo
    mapa.set(l.vigente_de, metas)
  }
  return [...mapa.entries()].map(([vigenteDe, metas]) => ({ vigenteDe, metas }))
}
