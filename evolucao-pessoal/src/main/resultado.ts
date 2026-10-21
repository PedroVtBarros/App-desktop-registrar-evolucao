import { ErroDominio } from '../core/erros'
import type { Resultado } from '../shared/item'

/**
 * Operação exclusiva em andamento (backup, restauração ou importação). Enquanto existir,
 * as demais chamadas ao banco são recusadas: impede escrita concorrente com a restauração.
 */
let operacaoEmAndamento: string | null = null

export function operacaoAtual(): string | null {
  return operacaoEmAndamento
}

/** Após restaurar, o banco foi fechado: tudo é recusado até o aplicativo reiniciar. */
let reiniciando = false
export function marcarReinicio(): void {
  reiniciando = true
}
const MSG_REINICIANDO = 'O aplicativo está reiniciando para carregar os dados restaurados.'

const MSG_OCUPADO = 'Há uma operação de dados em andamento (backup, restauração ou importação). Tente novamente em instantes.'

function converter(erro: unknown): { ok: false; erro: { campo?: string; mensagem: string } } {
  if (erro instanceof ErroDominio) {
    return {
      ok: false,
      erro: erro.campo ? { campo: erro.campo, mensagem: erro.message } : { mensagem: erro.message }
    }
  }
  console.error('Erro inesperado no IPC:', erro instanceof Error ? erro.message : 'desconhecido')
  return { ok: false, erro: { mensagem: 'Erro inesperado ao acessar os dados.' } }
}

/** Converte exceções em Resultado; erros inesperados não vazam detalhes ao renderer. */
export function tratar<T>(acao: () => T): Resultado<T> {
  if (reiniciando) return { ok: false, erro: { mensagem: MSG_REINICIANDO } }
  if (operacaoEmAndamento !== null) return { ok: false, erro: { mensagem: MSG_OCUPADO } }
  try {
    return { ok: true, dados: acao() }
  } catch (erro) {
    return converter(erro)
  }
}

/** Executa uma operação assíncrona exclusiva; recusa se já houver outra em andamento. */
export async function tratarExclusivo<T>(
  nome: string,
  acao: () => Promise<T>
): Promise<Resultado<T>> {
  if (reiniciando) return { ok: false, erro: { mensagem: MSG_REINICIANDO } }
  if (operacaoEmAndamento !== null) return { ok: false, erro: { mensagem: MSG_OCUPADO } }
  operacaoEmAndamento = nome
  try {
    return { ok: true, dados: await acao() }
  } catch (erro) {
    return converter(erro)
  } finally {
    operacaoEmAndamento = null
  }
}
