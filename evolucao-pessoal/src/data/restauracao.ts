import Database from 'better-sqlite3'
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { ErroDominio } from '../core/erros'
import { carimbo, copiaDeSeguranca } from './backup'
import { VERSAO_SCHEMA_APP, verificarBancoSqlite, type VerificacaoBanco } from './integridade'
import { migrar } from './migracoes'

export interface PreparoRestauracao extends VerificacaoBanco {
  precisaMigrar: boolean
}

/**
 * Validação prévia (somente leitura) de um backup: SQLite íntegro, do Evolução Pessoal,
 * de versão que esta aplicação entende. Versões anteriores serão migradas ao restaurar.
 */
export function prepararRestauracao(origem: string): PreparoRestauracao {
  const v = verificarBancoSqlite(origem)
  return { ...v, precisaMigrar: v.versaoSchema < VERSAO_SCHEMA_APP }
}

/** Operações de arquivo, injetáveis para simular falhas nos testes. */
export interface OperacoesArquivo {
  renomear(de: string, para: string): void
  remover(caminho: string): void
}

const operacoesReais: OperacoesArquivo = {
  renomear: (de, para) => renameSync(de, para),
  remover: (caminho) => rmSync(caminho, { force: true })
}

export interface OpcoesRestauracao {
  /** Conexão em uso; será fechada na etapa de substituição. */
  db: Database.Database
  origem: string
  pastaSeguranca: string
  ops?: OperacoesArquivo
}

/**
 * Restauração segura:
 *  1. valida o backup (somente leitura);
 *  2. prepara uma cópia temporária ao lado do banco (API de backup), migra e verifica;
 *  3. cria uma cópia de segurança do banco atual (e a verifica);
 *  4. só então fecha a conexão, move o banco atual para um nome auxiliar, remove -wal/-shm
 *     obsoletos e coloca a cópia preparada no lugar;
 *  5. se algo falhar depois de fechar, restaura o arquivo anterior.
 * Antes da etapa 4 nada em uso é tocado e a conexão continua aberta. O arquivo escolhido
 * pelo usuário nunca é alterado nem apagado. Depois de sucesso, o chamador deve reiniciar
 * o aplicativo para recarregar os dados.
 */
export async function restaurarBanco(opcoes: OpcoesRestauracao): Promise<{ copiaSeguranca: string }> {
  const { db, origem, pastaSeguranca } = opcoes
  const ops = opcoes.ops ?? operacoesReais
  const caminhoDb = db.name
  if (resolve(origem).toLowerCase() === resolve(caminhoDb).toLowerCase()) {
    throw new ErroDominio('Escolha um arquivo de backup, não o banco em uso.')
  }

  // 1. validar
  prepararRestauracao(origem)

  // 2. preparar cópia temporária migrada e íntegra, na mesma pasta do banco (rename atômico)
  const selo = carimbo()
  const temporario = `${caminhoDb}.restaurando-${selo}.tmp`
  const anterior = `${caminhoDb}.anterior-${selo}.tmp`
  try {
    const fonte = new Database(origem, { readonly: true, fileMustExist: true })
    try {
      await fonte.backup(temporario)
    } finally {
      fonte.close()
    }
    const prep = new Database(temporario)
    try {
      migrar(prep)
      const integ = prep.pragma('integrity_check') as { integrity_check: string }[]
      if (integ.length !== 1 || integ[0]?.integrity_check !== 'ok') {
        throw new ErroDominio('A cópia preparada para restauração falhou na verificação de integridade.')
      }
      if ((prep.pragma('foreign_key_check') as unknown[]).length > 0) {
        throw new ErroDominio('O backup tem referências inconsistentes e não pode ser restaurado.')
      }
      prep.pragma('journal_mode = DELETE')
    } finally {
      prep.close()
    }
  } catch (erro) {
    limparTemporarios(ops, temporario)
    if (erro instanceof ErroDominio) throw erro
    throw new ErroDominio('Não foi possível preparar a restauração; nada foi alterado.')
  }

  // 3. cópia de segurança do banco atual
  let copiaSeguranca: string
  try {
    copiaSeguranca = await copiaDeSeguranca(db, pastaSeguranca, 'antes-de-restaurar')
  } catch (erro) {
    limparTemporarios(ops, temporario)
    if (erro instanceof ErroDominio) throw erro
    throw new ErroDominio('Não foi possível criar a cópia de segurança; nada foi alterado.')
  }

  // 4. substituir (a partir daqui a conexão é fechada)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* banco sem WAL: nada a fazer */
  }
  db.close()
  let moveuAtual = false
  try {
    ops.renomear(caminhoDb, anterior)
    moveuAtual = true
    ops.remover(`${caminhoDb}-wal`)
    ops.remover(`${caminhoDb}-shm`)
    ops.renomear(temporario, caminhoDb)
  } catch {
    // 5. recuperação: devolve o banco anterior ao lugar
    try {
      if (moveuAtual && !existsSync(caminhoDb)) ops.renomear(anterior, caminhoDb)
    } catch {
      // Último recurso: copia a cópia de segurança verificada para o lugar do banco.
      try {
        if (!existsSync(caminhoDb)) copyFileSync(copiaSeguranca, caminhoDb)
      } catch {
        /* sem mais o que fazer; a cópia de segurança permanece em disco */
      }
    }
    limparTemporarios(ops, temporario)
    throw new ErroDominio(
      `A restauração falhou ao substituir o banco. Seus dados anteriores foram preservados (cópia em ${copiaSeguranca}). Reinicie o aplicativo.`
    )
  }
  // sucesso: o arquivo auxiliar do banco anterior é descartável (há a cópia de segurança)
  try {
    ops.remover(anterior)
  } catch {
    /* ignora */
  }
  return { copiaSeguranca }
}

function limparTemporarios(ops: OperacoesArquivo, temporario: string): void {
  for (const sufixo of ['', '-wal', '-shm']) {
    try {
      ops.remover(`${temporario}${sufixo}`)
    } catch {
      /* ignora */
    }
  }
}
