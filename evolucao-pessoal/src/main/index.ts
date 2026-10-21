import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { AvaliacaoRepositorio } from '../data/avaliacoes'
import { abrirBanco } from '../data/banco'
import { DiarioRepositorio } from '../data/diario'
import { EstatisticasRepositorio } from '../data/estatisticas'
import { EvolucaoRepositorio } from '../data/evolucao'
import { ItemRepositorio } from '../data/itens'
import { IPC, type PingResultado } from '../shared/ipc'
import { registrarIpcAvaliacoes } from './ipc-avaliacoes'
import { registrarIpcDados } from './ipc-dados'
import { registrarIpcDia } from './ipc-dia'
import { registrarIpcEstatisticas } from './ipc-estatisticas'
import { registrarIpcEvolucao } from './ipc-evolucao'
import { registrarIpcItens } from './ipc-itens'

function criarJanela(): void {
  const janela = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'Evolução Pessoal',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  janela.once('ready-to-show', () => janela.show())

  // Nenhuma navegação ou janela externa: o app é local e offline.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (evento, url) => {
    if (url !== janela.webContents.getURL()) evento.preventDefault()
  })

  const urlDev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && urlDev) {
    void janela.loadURL(urlDev)
  } else {
    void janela.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registrarIpc(): void {
  ipcMain.handle(IPC.ping, (): PingResultado => ({
    ok: true,
    versao: app.getVersion(),
    pastaDados: app.getPath('userData')
  }))
}

let banco: Database.Database | null = null

// Pasta de dados estável entre versões e entre execução em desenvolvimento e instalada.
// (Um --user-data-dir explícito, usado em testes, tem prioridade.)
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), 'evolucao-pessoal'))
}

// Uma única instância por pasta de dados: duas instâncias não escrevem no mesmo banco.
const instanciaUnica = app.requestSingleInstanceLock()
if (!instanciaUnica) {
  app.quit()
}
app.on('second-instance', () => {
  const j = BrowserWindow.getAllWindows()[0]
  if (j) {
    if (j.isMinimized()) j.restore()
    j.focus()
  }
})

void app.whenReady().then(() => {
  if (!instanciaUnica) return
  try {
    banco = abrirBanco(join(app.getPath('userData'), 'evolucao.db'))
  } catch (erro) {
    // Sem banco o app não pode funcionar; avisa em vez de abrir uma janela quebrada.
    dialog.showErrorBox(
      'Evolução Pessoal',
      `Não foi possível abrir o banco de dados.\n\n${erro instanceof Error ? erro.message : String(erro)}`
    )
    app.quit()
    return
  }
  registrarIpc()
  const itens = new ItemRepositorio(banco)
  registrarIpcItens(itens)
  registrarIpcDia(new DiarioRepositorio(banco, itens))
  registrarIpcEstatisticas(new EstatisticasRepositorio(banco, itens))
  registrarIpcEvolucao(new EvolucaoRepositorio(banco, itens))
  registrarIpcAvaliacoes(new AvaliacaoRepositorio(banco, itens))
  registrarIpcDados(banco)
  criarJanela()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('will-quit', () => {
  banco?.close()
  banco = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
