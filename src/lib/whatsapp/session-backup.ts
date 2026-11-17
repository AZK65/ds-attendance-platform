import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

type Manifest = { version: 1; createdAt: string; account: string; consistency: 'live' | 'closed'; files: Record<string, string> }
const snapshotName = /^snapshot-[\d]+-[a-f0-9-]+$/
const retainedPaths = ['Local State', 'Default/Preferences', 'Default/IndexedDB', 'Default/Local Storage', 'Default/Session Storage', 'Default/Network', 'Default/Cookies']

/** Private, bounded snapshots. Live copies are best effort, not a guarantee that
 * WhatsApp will accept a restored device. Revoked credentials are never restored. */
export class WhatsAppSessionBackup {
  private task: Promise<unknown> = Promise.resolve()
  constructor(readonly authRoot: string, readonly root: string) {
    if (path.resolve(authRoot) === path.resolve(root) || path.resolve(root).startsWith(path.resolve(authRoot) + path.sep)) throw new Error('Backups must be outside the active auth folder')
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.task.then(fn, fn)
    this.task = result.catch(() => undefined)
    return result
  }
  async settled() { await this.task }
  private async prepare() { await fs.mkdir(this.root, { recursive: true, mode: 0o700 }); await fs.chmod(this.root, 0o700) }
  async revoke() {
    return this.serial(async () => { await this.prepare(); await fs.writeFile(path.join(this.root, 'revoked'), new Date().toISOString(), { mode: 0o600 }) })
  }
  async linked() {
    return this.serial(async () => {
      await this.prepare()
      const revokedAt = await this.revokedAt()
      await fs.writeFile(path.join(this.root, 'linked'), new Date(Math.max(Date.now(), revokedAt + 1)).toISOString(), { mode: 0o600 })
    })
  }
  private async revokedAt() { return fs.readFile(path.join(this.root, 'revoked'), 'utf8').then(s => Date.parse(s) || Number.MAX_SAFE_INTEGER, () => 0) }
  private async revoked() {
    const revokedAt = await this.revokedAt()
    const linkedAt = await fs.readFile(path.join(this.root, 'linked'), 'utf8').then(s => Date.parse(s) || 0, () => 0)
    return revokedAt > 0 && revokedAt >= linkedAt
  }
  private async inventory(folder: string, relative = ''): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    for (const entry of await fs.readdir(path.join(folder, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Session snapshots cannot contain symbolic links')
      if (entry.isDirectory()) Object.assign(result, await this.inventory(folder, name))
      else if (entry.isFile()) result[name] = createHash('sha256').update(await fs.readFile(path.join(folder, name))).digest('hex')
    }
    return result
  }
  private async privateModes(folder: string) {
    await fs.chmod(folder, 0o700)
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const target = path.join(folder, entry.name)
      if (entry.isDirectory()) await this.privateModes(target)
      else if (entry.isFile()) await fs.chmod(target, 0o600)
      else throw new Error('Unsupported session file')
    }
  }
  async capture(account: string, consistency: 'live' | 'closed') {
    return this.serial(async () => {
      await this.prepare()
      if (!account || await this.revoked()) return null
      const source = path.join(this.authRoot, 'session')
      const name = `snapshot-${Date.now()}-${randomUUID()}`
      const temp = path.join(this.root, `pending-${randomUUID()}`)
      const profile = path.join(temp, 'profile')
      await fs.mkdir(profile, { recursive: true, mode: 0o700 })
      try {
        for (const relative of retainedPaths) {
          const from = path.join(source, relative)
          const stat = await fs.lstat(from).catch(() => null)
          if (!stat) continue
          if (stat.isSymbolicLink()) throw new Error('Session path is a symbolic link')
          await fs.cp(from, path.join(profile, relative), { recursive: true, filter: async (file) => {
            if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('Session path is a symbolic link')
            return !['LOCK', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'].includes(path.basename(file))
          } })
        }
        const files = await this.inventory(profile)
        if (!Object.keys(files).some(file => file.startsWith('Default/IndexedDB/'))) throw new Error('No session database to back up')
        const manifest: Manifest = { version: 1, createdAt: new Date().toISOString(), account, consistency, files }
        await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 })
        await this.privateModes(temp)
        await fs.rename(temp, path.join(this.root, name))
        const previous = (await fs.readdir(this.root)).filter(n => snapshotName.test(n)).sort().reverse()
        for (const old of previous.slice(3)) await fs.rm(path.join(this.root, old), { recursive: true, force: true })
        return manifest.createdAt
      } catch (error) {
        await fs.rm(temp, { recursive: true, force: true })
        throw error
      }
    })
  }
  async status() {
    await this.prepare()
    const names = (await fs.readdir(this.root)).filter(n => snapshotName.test(n)).sort().reverse()
    const revokedAt = await this.revokedAt()
    const manifests = await Promise.all(names.map(name => fs.readFile(path.join(this.root, name, 'manifest.json'), 'utf8').then(s => JSON.parse(s) as Manifest).catch(() => null)))
    const eligible = manifests.filter(m => m && Date.parse(m.createdAt) > revokedAt)
    return { count: eligible.length, lastBackupAt: eligible[0]?.createdAt ?? null, revoked: await this.revoked() }
  }
  /** Caller MUST stop Chromium first. Existing profile is retained, never overwritten. */
  async restore() {
    return this.serial(async () => {
      await this.prepare()
      if (await this.revoked()) throw new Error('WhatsApp logged this device out. Please scan a new QR code; the old session cannot be restored.')
      const names = (await fs.readdir(this.root)).filter(n => snapshotName.test(n)).sort().reverse()
      const revokedAt = await this.revokedAt()
      for (const name of names) {
        const snapshot = path.join(this.root, name)
        const manifest = await fs.readFile(path.join(snapshot, 'manifest.json'), 'utf8').then(s => JSON.parse(s) as Manifest).catch(() => null)
        if (!manifest || manifest.version !== 1 || !manifest.files || Date.parse(manifest.createdAt) <= revokedAt) continue
        const profile = path.join(snapshot, 'profile')
        const files = await this.inventory(profile).catch(() => null)
        if (!files || JSON.stringify(Object.entries(files).sort()) !== JSON.stringify(Object.entries(manifest.files).sort())) continue
        const staging = path.join(this.authRoot, `restore-${randomUUID()}`)
        await fs.mkdir(this.authRoot, { recursive: true, mode: 0o700 })
        await fs.cp(profile, staging, { recursive: true })
        await this.privateModes(staging)
        const active = path.join(this.authRoot, 'session')
        const archived = path.join(this.authRoot, `previous-${Date.now()}-${randomUUID()}`)
        const exists = await fs.access(active).then(() => true, () => false)
        if (exists) await fs.rename(active, archived)
        try { await fs.rename(staging, active) } catch (error) {
          if (exists) await fs.rename(archived, active)
          throw error
        }
        return manifest.createdAt
      }
      throw new Error('No intact session backup is available. Please scan a fresh QR code.')
    })
  }
}
