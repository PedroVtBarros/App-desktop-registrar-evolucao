import Database from 'better-sqlite3'
import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import { ErroDominio } from '../core/erros'
import type { ContagensBanco } from '../shared/dados'
import { MIGRACOES } from './migracoes'

export interface VerificacaoBanco {
  versaoSchema: number
  contagens: ContagensBanco
}

const CABECALHO_SQLITE = 'SQLite format 3\u0000'

export const VERSAO_SCHEMA_APP = Math.max(...MIGRACOES.map((m) => m.versao))

function temTabela(db: Database.Database, nome: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome) !==
    undefined
  )
}

function contar(db: Database.Database, tabela: string): number {
  if (!temTabela(db, tabela)) return 0
  // `tabela` vem de uma lista fixa interna, nunca de entrada externa.
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n
}

export function contarBanco(db: Database.Database): ContagensBanco {
  return {
    atividades: contar(db, 'item'),
    programacoes: contar(db, 'programacao_semanal'),
    registros: contar(db, 'registro'),
    descansos: contar(db, 'descanso_data'),
    avaliacoes: contar(db, 'avaliacao')
  }
}

/** Confere que o arquivo começa com o cabeçalho de um banco SQLite. */
export function ehArquivoSqlite(caminho: string): boolean {
  let fd: number | null = null
  try {
    fd = openSync(caminho, 'r')
    const buf = Buffer.alloc(16)
    const lidos = readSync(fd, buf, 0, 16, 0)
    return lidos === 16 && buf.toString('latin1') === CABECALHO_SQLITE
  } catch {
    return false
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * Valida (somente leitura) que `caminho` é um banco SQLite íntegro do Evolução Pessoal,
 * de versão que esta aplicação consegue interpretar. Nunca altera o arquivo.
 */
export function verificarBancoSqlite(caminho: string): VerificacaoBanco {
  if (!existsSync(caminho)) throw new ErroDominio('Arquivo não encontrado.')
  if (!ehArquivoSqlite(caminho)) {
    throw new ErroDominio('O arquivo escolhido não é um banco de dados SQLite.')
  }
  let db: Database.Database
  try {
    db = new Database(caminho, { readonly: true, fileMustExist: true })
  } catch {
    throw new ErroDominio('Não foi possível abrir o arquivo como banco SQLite.')
  }
  try {
    const integridade = db.pragma('integrity_check') as { integrity_check: string }[]
    if (integridade.length !== 1 || integridade[0]?.integrity_check !== 'ok') {
      throw new ErroDominio('O arquivo está corrompido (falhou na verificação de integridade).')
    }
    if (!temTabela(db, 'schema_migrations') || !temTabela(db, 'item')) {
      throw new ErroDominio('O arquivo é um banco SQLite, mas não é um backup do Evolução Pessoal.')
    }
    const versoes = (
      db.prepare('SELECT versao FROM schema_migrations').all() as { versao: number }[]
    ).map((r) => r.versao)
    const maior = Math.max(0, ...versoes)
    if (maior > VERSAO_SCHEMA_APP) {
      throw new ErroDominio(
        `Este backup foi criado por uma versão mais nova do aplicativo (schema ${maior}; esta versão entende até ${VERSAO_SCHEMA_APP}). Atualize o aplicativo antes de restaurar.`
      )
    }
    if (maior === 0) {
      throw new ErroDominio('O banco não possui nenhuma migração aplicada; versão não reconhecida.')
    }
    return { versaoSchema: maior, contagens: contarBanco(db) }
  } catch (e) {
    if (e instanceof ErroDominio) throw e
    throw new ErroDominio('Não foi possível verificar o arquivo escolhido.')
  } finally {
    db.close()
  }
}
