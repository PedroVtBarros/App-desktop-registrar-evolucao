import { ipcMain } from 'electron'
import { validarPeriodo } from '../core/validacao'
import type { EstatisticasRepositorio } from '../data/estatisticas'
import { IPC } from '../shared/ipc'
import { tratar } from './resultado'

export function registrarIpcEstatisticas(estatisticas: EstatisticasRepositorio): void {
  ipcMain.handle(IPC.estatisticasObter, (_e, periodo: unknown) =>
    tratar(() => estatisticas.obter(validarPeriodo(periodo)))
  )
}
