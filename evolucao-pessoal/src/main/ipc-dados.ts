import type Database from 'better-sqlite3'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { hojeIso } from '../core/datas'
import { ErroDominio } from '../core/erros'
import { validarEscolhasImportacao } from '../core/validacao'
import { caminhoEmTemporario, copiaDeSeguranca, criarBackupSeguro } from '../data/backup'
import { analisarBancoAntigo, executarImportacao, paraPrevia, type AnaliseInterna } from '../data/importacao'
import { contarBanco, VERSAO_SCHEMA_APP } from '../data/integridade'
import { prepararRestauracao, restaurarBanco } from '../data/restauracao'
import type { InfoDados } from '../shared/dados'
import { IPC } from '../shared/ipc'
import { marcarReinicio, tratar, tratarExclusivo } from './resultado'

interface Pendente {
  token: string
  caminho: string
}

/** Último arquivo escolhido pelo usuário em cada fluxo; o renderer só devolve o token. */
let pendenteRestauracao: Pendente | null = null
let pendenteImportacao: (Pendente & { analise: AnaliseInterna }) | null = null

function janela(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function pastaBackupsAutomaticos(): string {
  return join(app.getPath('userData'), 'backups-automaticos')
}

function caminhoPadraoBancoAntigo(): string {
  return join(homedir(), '.evolucao_1pct', 'evolucao.db')
}

function nomeBackupPadrao(): string {
  return `evolucao-pessoal-backup-${hojeIso()}.db`
}

export function registrarIpcDados(db: Database.Database): void {
  ipcMain.handle(IPC.dadosInfo, () =>
    tratar((): InfoDados => {
      const versao = db
        .prepare('SELECT MAX(versao) AS v FROM schema_migrations')
        .get() as { v: number | null }
      return {
        pastaDados: app.getPath('userData'),
        arquivoBanco: db.name,
        pastaBackupsAutomaticos: pastaBackupsAutomaticos(),
        versaoApp: app.getVersion(),
        versaoSchema: versao.v ?? VERSAO_SCHEMA_APP,
        contagens: contarBanco(db)
      }
    })
  )

  // ------------------------------------------------------------------ backup
  ipcMain.handle(IPC.dadosCriarBackup, () =>
    tratarExclusivo('backup', async () => {
      const escolha = await dialog.showSaveDialog(janela() as BrowserWindow, {
        title: 'Salvar backup do Evolução Pessoal',
        defaultPath: join(app.getPath('documents'), nomeBackupPadrao()),
        filters: [{ name: 'Banco de dados SQLite', extensions: ['db'] }],
        properties: ['showOverwriteConfirmation', 'createDirectory']
      })
      if (escolha.canceled || !escolha.filePath) return { cancelado: true as const }
      if (caminhoEmTemporario(escolha.filePath)) {
        throw new ErroDominio(
          'Escolha uma pasta fixa (como Documentos): a pasta temporária do sistema pode ser limpa automaticamente.'
        )
      }
      const r = await criarBackupSeguro(db, escolha.filePath)
      return { cancelado: false as const, dados: r }
    })
  )

  // ------------------------------------------------------------- restauração
  ipcMain.handle(IPC.dadosEscolherRestauracao, () =>
    tratarExclusivo('restauracao-previa', async () => {
      const escolha = await dialog.showOpenDialog(janela() as BrowserWindow, {
        title: 'Escolher backup para restaurar',
        defaultPath: app.getPath('documents'),
        filters: [
          { name: 'Banco de dados SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      })
      const caminho = escolha.filePaths[0]
      if (escolha.canceled || !caminho) return { cancelado: true as const }
      if (resolve(caminho).toLowerCase() === resolve(db.name).toLowerCase()) {
        throw new ErroDominio('Escolha um arquivo de backup, não o banco em uso.')
      }
      const prep = prepararRestauracao(caminho)
      const token = randomUUID()
      pendenteRestauracao = { token, caminho }
      return {
        cancelado: false as const,
        dados: {
          token,
          arquivo: caminho,
          versaoSchemaBackup: prep.versaoSchema,
          versaoSchemaApp: VERSAO_SCHEMA_APP,
          precisaMigrar: prep.precisaMigrar,
          contagensBackup: prep.contagens,
          contagensAtuais: contarBanco(db),
          pastaCopiaSeguranca: pastaBackupsAutomaticos()
        }
      }
    })
  )

  ipcMain.handle(IPC.dadosConfirmarRestauracao, (_e, token: unknown) =>
    tratarExclusivo('restauracao', async () => {
      const pend = pendenteRestauracao
      if (!pend || typeof token !== 'string' || token !== pend.token) {
        throw new ErroDominio('A restauração não foi confirmada para este arquivo. Escolha o backup novamente.')
      }
      pendenteRestauracao = null
      try {
        const r = await restaurarBanco({
          db,
          origem: pend.caminho,
          pastaSeguranca: pastaBackupsAutomaticos()
        })
        reiniciarAplicativo()
        return { copiaSeguranca: r.copiaSeguranca, reiniciando: true }
      } catch (erro) {
        // Se a conexão já foi fechada, o aplicativo só volta a funcionar reiniciando.
        if (!db.open) reiniciarAplicativo()
        throw erro
      }
    })
  )

  // -------------------------------------------------------------- importação
  ipcMain.handle(IPC.dadosAnalisarImportacao, () =>
    tratarExclusivo('importacao-previa', async () => {
      const padrao = caminhoPadraoBancoAntigo()
      const escolha = await dialog.showOpenDialog(janela() as BrowserWindow, {
        title: 'Escolher o banco do aplicativo antigo (evolucao.db)',
        defaultPath: existsSync(padrao) ? padrao : homedir(),
        filters: [
          { name: 'Banco de dados SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      })
      const caminho = escolha.filePaths[0]
      if (escolha.canceled || !caminho) return { cancelado: true as const }
      if (resolve(caminho).toLowerCase() === resolve(db.name).toLowerCase()) {
        throw new ErroDominio('Este é o banco do aplicativo novo. Escolha o evolucao.db do aplicativo antigo.')
      }
      const analise = analisarBancoAntigo(caminho, db, hojeIso())
      const token = randomUUID()
      pendenteImportacao = { token, caminho, analise }
      return { cancelado: false as const, dados: paraPrevia(analise, token) }
    })
  )

  ipcMain.handle(IPC.dadosImportar, (_e, token: unknown, escolhas: unknown) =>
    tratarExclusivo('importacao', async () => {
      const pend = pendenteImportacao
      if (!pend || typeof token !== 'string' || token !== pend.token) {
        throw new ErroDominio('A importação não foi confirmada para este arquivo. Analise o arquivo novamente.')
      }
      const validadas = validarEscolhasImportacao(escolhas)
      if (!validadas.some((e) => e.importar)) {
        throw new ErroDominio('Selecione ao menos um indicador para importar.')
      }
      // 1) cópia de segurança do banco atual, antes de qualquer escrita
      const copia = await copiaDeSeguranca(db, pastaBackupsAutomaticos(), 'antes-de-importar')
      // 2) importação em transação única (refaz a análise e valida de novo)
      const r = executarImportacao(db, pend.caminho, validadas, hojeIso(), new Date().toISOString(), copia)
      pendenteImportacao = null
      return r
    })
  )
}

/** Reinicia o aplicativo depois de responder ao renderer, para recarregar todos os dados. */
function reiniciarAplicativo(): void {
  marcarReinicio()
  setTimeout(() => {
    app.relaunch()
    app.exit(0)
  }, 600)
}
