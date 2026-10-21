import { ipcMain } from 'electron'
import { hojeIso } from '../core/datas'
import { validarData, validarId, validarMotivo, validarNovoRegistro } from '../core/validacao'
import type { DiarioRepositorio } from '../data/diario'
import { IPC } from '../shared/ipc'
import { tratar } from './resultado'

export function registrarIpcDia(diario: DiarioRepositorio): void {
  ipcMain.handle(IPC.diaObter, (_e, data: unknown) =>
    tratar(() => diario.obterDia(data === null ? hojeIso() : validarData(data, 'data')))
  )
  ipcMain.handle(IPC.diaRegistrar, (_e, itemId: unknown, data: unknown, registro: unknown) =>
    tratar(() =>
      diario.registrar(validarId(itemId), validarData(data, 'data'), validarNovoRegistro(registro))
    )
  )
  ipcMain.handle(IPC.diaLimpar, (_e, itemId: unknown, data: unknown) =>
    tratar(() => diario.limpar(validarId(itemId), validarData(data, 'data')))
  )
  ipcMain.handle(IPC.diaDefinirDescanso, (_e, itemId: unknown, data: unknown, motivo: unknown) =>
    tratar(() =>
      diario.definirDescanso(validarId(itemId), validarData(data, 'data'), validarMotivo(motivo))
    )
  )
  ipcMain.handle(IPC.diaRemoverDescanso, (_e, itemId: unknown, data: unknown) =>
    tratar(() => diario.removerDescanso(validarId(itemId), validarData(data, 'data')))
  )
}
