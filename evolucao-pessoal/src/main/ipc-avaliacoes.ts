import { ipcMain } from 'electron'
import { validarData, validarId, validarNovaAvaliacao } from '../core/validacao'
import type { AvaliacaoRepositorio } from '../data/avaliacoes'
import { IPC } from '../shared/ipc'
import { tratar } from './resultado'

export function registrarIpcAvaliacoes(avaliacoes: AvaliacaoRepositorio): void {
  ipcMain.handle(IPC.avaliacoesResumo, () => tratar(() => avaliacoes.resumoHabilidades()))
  ipcMain.handle(IPC.avaliacoesHistorico, (_e, itemId: unknown) =>
    tratar(() => avaliacoes.historico(validarId(itemId)))
  )
  ipcMain.handle(IPC.avaliacoesSalvar, (_e, itemId: unknown, data: unknown, avaliacao: unknown) =>
    tratar(() =>
      avaliacoes.salvar(
        validarId(itemId),
        validarData(data, 'data'),
        validarNovaAvaliacao(avaliacao)
      )
    )
  )
  ipcMain.handle(IPC.avaliacoesRemover, (_e, itemId: unknown, data: unknown) =>
    tratar(() => {
      avaliacoes.remover(validarId(itemId), validarData(data, 'data'))
      return null
    })
  )
}
