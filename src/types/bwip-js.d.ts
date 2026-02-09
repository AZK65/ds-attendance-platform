declare module 'bwip-js' {
  interface ToBufferOptions {
    bcid: string
    text: string
    scale?: number
    height?: number
    width?: number
    includetext?: boolean
    textxalign?: string
    padding?: number
    paddingwidth?: number
    paddingheight?: number
    backgroundcolor?: string
  }

  function toBuffer(opts: ToBufferOptions): Promise<Buffer>

  export default { toBuffer }
}
