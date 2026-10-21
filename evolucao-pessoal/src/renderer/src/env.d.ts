import type { ApiEvolucao } from '../../shared/ipc'

declare global {
  interface Window {
    api: ApiEvolucao
  }
}

export {}
