/** Erro esperado de regra de negócio/validação; a mensagem é segura para exibir ao usuário. */
export class ErroDominio extends Error {
  readonly campo: string | undefined

  constructor(mensagem: string, campo?: string) {
    super(mensagem)
    this.name = 'ErroDominio'
    this.campo = campo
  }
}
