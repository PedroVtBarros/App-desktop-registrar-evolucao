import { ipcMain } from 'electron'
import { validarData, validarEdicao, validarId, validarMetas, validarNovoItem } from '../core/validacao'
import type { ItemRepositorio } from '../data/itens'
import { IPC } from '../shared/ipc'
import { tratar } from './resultado'

export function registrarIpcItens(repo: ItemRepositorio): void {
  ipcMain.handle(IPC.itensListar, (_e, incluirArquivados: unknown) =>
    tratar(() => repo.listar(incluirArquivados === true))
  )
  ipcMain.handle(IPC.itensCriar, (_e, novo: unknown) =>
    tratar(() => repo.criar(validarNovoItem(novo)))
  )
  ipcMain.handle(IPC.itensEditar, (_e, id: unknown, dados: unknown) =>
    tratar(() => repo.editar(validarId(id), validarEdicao(dados)))
  )
  ipcMain.handle(IPC.itensDefinirProgramacao, (_e, id: unknown, metas: unknown, vigenteDe: unknown) =>
    tratar(() =>
      repo.definirProgramacao(
        validarId(id),
        validarMetas(metas),
        validarData(vigenteDe, 'vigenteDe')
      )
    )
  )
  ipcMain.handle(IPC.itensArquivar, (_e, id: unknown) =>
    tratar(() => repo.arquivar(validarId(id)))
  )
  ipcMain.handle(IPC.itensDesarquivar, (_e, id: unknown) =>
    tratar(() => repo.desarquivar(validarId(id)))
  )
  ipcMain.handle(IPC.itensExcluir, (_e, id: unknown) =>
    tratar(() => {
      repo.excluir(validarId(id))
      return null
    })
  )
}
