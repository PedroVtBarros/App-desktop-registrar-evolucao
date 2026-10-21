import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ApiEvolucao } from '../shared/ipc'

const api: ApiEvolucao = {
  ping: () => ipcRenderer.invoke(IPC.ping),
  itens: {
    listar: (incluirArquivados) => ipcRenderer.invoke(IPC.itensListar, incluirArquivados),
    criar: (novo) => ipcRenderer.invoke(IPC.itensCriar, novo),
    editar: (id, dados) => ipcRenderer.invoke(IPC.itensEditar, id, dados),
    definirProgramacao: (id, metas, vigenteDe) =>
      ipcRenderer.invoke(IPC.itensDefinirProgramacao, id, metas, vigenteDe),
    arquivar: (id) => ipcRenderer.invoke(IPC.itensArquivar, id),
    desarquivar: (id) => ipcRenderer.invoke(IPC.itensDesarquivar, id),
    excluir: (id) => ipcRenderer.invoke(IPC.itensExcluir, id)
  },
  dia: {
    obter: (data) => ipcRenderer.invoke(IPC.diaObter, data),
    registrar: (itemId, data, registro) =>
      ipcRenderer.invoke(IPC.diaRegistrar, itemId, data, registro),
    limpar: (itemId, data) => ipcRenderer.invoke(IPC.diaLimpar, itemId, data),
    definirDescanso: (itemId, data, motivo) =>
      ipcRenderer.invoke(IPC.diaDefinirDescanso, itemId, data, motivo),
    removerDescanso: (itemId, data) => ipcRenderer.invoke(IPC.diaRemoverDescanso, itemId, data)
  },
  estatisticas: {
    obter: (periodo) => ipcRenderer.invoke(IPC.estatisticasObter, periodo)
  },
  evolucao: {
    obter: (consulta) => ipcRenderer.invoke(IPC.evolucaoObter, consulta)
  },
  avaliacoes: {
    resumo: () => ipcRenderer.invoke(IPC.avaliacoesResumo),
    historico: (itemId) => ipcRenderer.invoke(IPC.avaliacoesHistorico, itemId),
    salvar: (itemId, data, avaliacao) =>
      ipcRenderer.invoke(IPC.avaliacoesSalvar, itemId, data, avaliacao),
    remover: (itemId, data) => ipcRenderer.invoke(IPC.avaliacoesRemover, itemId, data)
  },
  dados: {
    info: () => ipcRenderer.invoke(IPC.dadosInfo),
    criarBackup: () => ipcRenderer.invoke(IPC.dadosCriarBackup),
    escolherRestauracao: () => ipcRenderer.invoke(IPC.dadosEscolherRestauracao),
    confirmarRestauracao: (token) => ipcRenderer.invoke(IPC.dadosConfirmarRestauracao, token),
    analisarImportacao: () => ipcRenderer.invoke(IPC.dadosAnalisarImportacao),
    importar: (token, escolhas) => ipcRenderer.invoke(IPC.dadosImportar, token, escolhas)
  }
}

contextBridge.exposeInMainWorld('api', api)
