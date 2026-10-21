import Database from 'better-sqlite3'
import { migrar } from './migracoes'

/** Abre (criando se preciso) o banco, ativa integridade referencial e aplica migrações. */
export function abrirBanco(caminho: string): Database.Database {
  const db = new Database(caminho)
  try {
    if (caminho !== ':memory:') db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrar(db)
    return db
  } catch (erro) {
    db.close()
    throw erro
  }
}
