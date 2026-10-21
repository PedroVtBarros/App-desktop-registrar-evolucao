import { ipcMain } from 'electron'
import { validarConsultaEvolucao } from '../core/validacao'
import type { EvolucaoRepositorio } from '../data/evolucao'
import { IPC } from '../shared/ipc'
import { tratar } from './resultado'

export function registrarIpcEvolucao(evolucao: EvolucaoRepositorio): void {
  ipcMain.handle(IPC.evolucaoObter, (_e, consulta: unknown) =>
    tratar(() => evolucao.obter(validarConsultaEvolucao(consulta)))
  )
}
