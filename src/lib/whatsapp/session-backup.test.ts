import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { WhatsAppSessionBackup } from './session-backup'

async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'qazi-wa-backup-'))
  const auth = path.join(root, 'auth'), backup = path.join(root, 'backup')
  const database = path.join(auth, 'session', 'Default', 'IndexedDB')
  await fs.mkdir(database, { recursive: true })
  await fs.writeFile(path.join(database, 'test.ldb'), 'synthetic session only')
  await fs.writeFile(path.join(database, 'LOCK'), 'not a credential')
  await fs.writeFile(path.join(auth, 'session', 'Local State'), '{}')
  return { root, auth, backup, database, store: new WhatsAppSessionBackup(auth, backup) }
}
test('snapshot is private, excludes locks, restores and preserves existing profile', async () => {
  const f = await fixture()
  await f.store.capture('school-test', 'closed')
  assert.equal((await fs.stat(f.backup)).mode & 0o777, 0o700)
  const name = (await fs.readdir(f.backup)).find(n => n.startsWith('snapshot-'))!
  const saved = path.join(f.backup, name, 'profile', 'Default', 'IndexedDB')
  assert.equal((await fs.stat(path.join(saved, 'test.ldb'))).mode & 0o777, 0o600)
  await assert.rejects(fs.access(path.join(saved, 'LOCK')))
  await fs.writeFile(path.join(f.database, 'test.ldb'), 'changed active profile')
  await f.store.restore()
  assert.equal(await fs.readFile(path.join(f.database, 'test.ldb'), 'utf8'), 'synthetic session only')
  const old = (await fs.readdir(f.auth)).find(n => n.startsWith('previous-'))!
  assert.equal(await fs.readFile(path.join(f.auth, old, 'Default', 'IndexedDB', 'test.ldb'), 'utf8'), 'changed active profile')
})
test('retains three complete snapshots, never promotes empty or failed copies', async () => {
  const f = await fixture()
  for (let i = 0; i < 5; i++) await f.store.capture('school-test', 'live')
  assert.equal((await f.store.status()).count, 3)
  await fs.rename(f.database, path.join(f.auth, 'saved-test-database'))
  await assert.rejects(f.store.capture('school-test', 'live'), /No session database/)
  assert.equal((await f.store.status()).count, 3)
  assert.equal((await fs.readdir(f.backup)).some(n => n.startsWith('pending-')), false)
})
test('confirmed logout prevents capture and restore until a successful new link', async () => {
  const f = await fixture()
  await f.store.capture('school-test', 'closed')
  await f.store.revoke()
  assert.equal(await f.store.capture('school-test', 'live'), null)
  await assert.rejects(f.store.restore(), /logged this device out/)
  assert.equal((await f.store.status()).revoked, true)
  await f.store.linked()
  assert.equal((await f.store.status()).revoked, false)
  await assert.rejects(f.store.restore(), /No intact/)
})
test('tampered snapshot is rejected without touching active data', async () => {
  const f = await fixture()
  await f.store.capture('school-test', 'closed')
  const name = (await fs.readdir(f.backup)).find(n => n.startsWith('snapshot-'))!
  await fs.writeFile(path.join(f.backup, name, 'profile', 'Default', 'IndexedDB', 'test.ldb'), 'corrupted')
  await assert.rejects(f.store.restore(), /No intact/)
  assert.equal(await fs.readFile(path.join(f.database, 'test.ldb'), 'utf8'), 'synthetic session only')
})
test('symbolic links cannot copy or restore files outside the session', async () => {
  const f = await fixture()
  await fs.symlink(path.join(f.auth, 'session', 'Local State'), path.join(f.database, 'link'))
  await assert.rejects(f.store.capture('school-test', 'live'), /symbolic link/)
  assert.equal((await f.store.status()).count, 0)
})
test('parallel backups serialize and return complete snapshots', async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 4 }, () => f.store.capture('school-test', 'live')))
  assert.equal((await f.store.status()).count, 3)
  await f.store.restore()
})
test('backup directory cannot be inside active auth directory', () => {
  assert.throws(() => new WhatsAppSessionBackup('/tmp/auth-example', '/tmp/auth-example/backup'), /outside/)
})
