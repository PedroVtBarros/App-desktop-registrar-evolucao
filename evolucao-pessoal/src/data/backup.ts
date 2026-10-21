import Database from 'better-sqlite3'
import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { ErroDominio } from '../core/erros'
import type { ResultadoBackup } from '../shared/dados'
import { verificarBancoSqlite } from './integridade'

function mesmoCaminho(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase()
}

/** True se o caminho está dentro da pasta temporária do sistema (sujeita a limpeza automática). */
export function caminhoEmTemporario(caminho: string, temporaria: string = tmpdir()): boolean {
  const alvo = resolve(caminho).toLowerCase()
  const base = resolve(temporaria).toLowerCase()
  return alvo.startsWith(base.endsWith(sep) ? base : base + sep)
}

export function carimbo(agora: Date = new Date()): string {
  return agora.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

/**
 * Cria uma cópia consistente do banco em uso, usando a API de backup do SQLite (segura
 * com WAL e com o banco aberto). O arquivo é escrito ao lado do destino, verificado e só
 * então movido para o nome final; nunca fica um backup parcial no destino. O banco
 * original não é modificado.
 */
export async function criarBackupSeguro(
  db: Database.Database,
  destino: string
): Promise<ResultadoBackup> {
  const final = resolve(destino)
  if (mesmoCaminho(final, db.name)) {
    throw new ErroDominio('O destino não pode ser o próprio banco de dados em uso.')
  }
  const parcial = `${final}.parcial`
  mkdirSync(dirname(final), { recursive: true })
  try {
    await db.backup(parcial)

    // Deixa o backup como arquivo único e autocontido (sem -wal/-shm).
    const copia = new Database(parcial)
    try {
      copia.pragma('journal_mode = DELETE')
    } finally {
      copia.close()
    }

    const verificacao = verificarBancoSqlite(parcial)
    renameSync(parcial, final)
    return {
      caminho: final,
      tamanhoBytes: statSync(final).size,
      versaoSchema: verificacao.versaoSchema,
      contagens: verificacao.contagens
    }
  } catch (erro) {
    rmSync(parcial, { force: true })
    rmSync(`${parcial}-wal`, { force: true })
    rmSync(`${parcial}-shm`, { force: true })
    if (erro instanceof ErroDominio) throw erro
    throw new ErroDominio('Não foi possível criar o backup. Verifique o destino e o espaço em disco.')
  }
}

/** Cópia de segurança automática (antes de restaurar ou importar). Retorna o caminho gerado. */
export async function copiaDeSeguranca(
  db: Database.Database,
  pasta: string,
  prefixo: string
): Promise<string> {
  const destino = join(pasta, `${prefixo}-${carimbo()}.db`)
  const r = await criarBackupSeguro(db, destino)
  return r.caminho
}
