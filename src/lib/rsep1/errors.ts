export class Rsep1Error extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message?: string) {
    super(message || code)
    this.name = 'Rsep1Error'
    this.status = status
    this.code = code
  }
}
