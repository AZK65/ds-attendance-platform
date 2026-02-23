import mysql from 'mysql2/promise'
import { Client as SSHClient } from 'ssh2'
import fs from 'fs'
import net from 'net'

// External MySQL database connection (driving_school_v2)
// In production (Docker on DO server): connects directly via host network
// In development (local Mac): connects via SSH tunnel

interface ExternalDBConfig {
  mysql: {
    host: string
    port: number
    user: string
    password: string
    database: string
  }
  ssh?: {
    host: string
    port: number
    username: string
    privateKeyPath: string
  }
}

function getConfig(): ExternalDBConfig {
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    // In production Docker container, connect to MySQL on the host
    // MySQL container exposes 3306 on host, use Docker host gateway
    return {
      mysql: {
        host: process.env.EXTERNAL_DB_HOST || '172.17.0.1', // Docker default gateway to host
        port: parseInt(process.env.EXTERNAL_DB_PORT || '3306'),
        user: process.env.EXTERNAL_DB_USER || 'root',
        password: process.env.EXTERNAL_DB_PASSWORD || 'driving123',
        database: process.env.EXTERNAL_DB_NAME || 'driving_school_v2',
      },
    }
  }

  // In development, use SSH tunnel
  return {
    mysql: {
      host: '127.0.0.1',
      port: 33060, // Local tunnel port
      user: process.env.EXTERNAL_DB_USER || 'root',
      password: process.env.EXTERNAL_DB_PASSWORD || 'driving123',
      database: process.env.EXTERNAL_DB_NAME || 'driving_school_v2',
    },
    ssh: {
      host: process.env.EXTERNAL_DB_SSH_HOST || '138.197.150.52',
      port: 22,
      username: 'root',
      privateKeyPath: process.env.EXTERNAL_DB_SSH_KEY || `${process.env.HOME}/.ssh/id_ed25519`,
    },
  }
}

// SSH tunnel management
let sshTunnel: { server: net.Server; client: SSHClient } | null = null
let tunnelReady = false

async function ensureSSHTunnel(): Promise<void> {
  if (tunnelReady && sshTunnel) return

  const config = getConfig()
  if (!config.ssh) return // No SSH needed in production

  return new Promise((resolve, reject) => {
    const sshClient = new SSHClient()

    const keyPath = config.ssh!.privateKeyPath
    let privateKey: Buffer
    try {
      privateKey = fs.readFileSync(keyPath)
    } catch (err) {
      reject(new Error(`Cannot read SSH key at ${keyPath}: ${err}`))
      return
    }

    const server = net.createServer((sock) => {
      sshClient.forwardOut(
        sock.remoteAddress || '127.0.0.1',
        sock.remotePort || 0,
        '127.0.0.1',
        3306,
        (err, stream) => {
          if (err) {
            sock.end()
            return
          }
          sock.pipe(stream).pipe(sock)
        }
      )
    })

    server.listen(33060, '127.0.0.1', () => {
      sshClient.connect({
        host: config.ssh!.host,
        port: config.ssh!.port,
        username: config.ssh!.username,
        privateKey,
        // If key has passphrase, it needs to be loaded in ssh-agent beforehand
        // or set EXTERNAL_DB_SSH_PASSPHRASE env var
        passphrase: process.env.EXTERNAL_DB_SSH_PASSPHRASE,
      })
    })

    sshClient.on('ready', () => {
      console.log('[ExternalDB] SSH tunnel established')
      sshTunnel = { server, client: sshClient }
      tunnelReady = true
      resolve()
    })

    sshClient.on('error', (err) => {
      console.error('[ExternalDB] SSH connection error:', err.message)
      tunnelReady = false
      sshTunnel = null
      server.close()
      reject(err)
    })

    sshClient.on('close', () => {
      tunnelReady = false
      sshTunnel = null
      server.close()
    })
  })
}

// MySQL connection pool (singleton)
let pool: mysql.Pool | null = null

async function getPool(): Promise<mysql.Pool> {
  const config = getConfig()

  // Set up SSH tunnel for development
  if (config.ssh) {
    await ensureSSHTunnel()
  }

  if (!pool) {
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
    })
    console.log(`[ExternalDB] MySQL pool created (${config.mysql.host}:${config.mysql.port})`)
  }

  return pool
}

// Public API

export interface StudentRecord {
  student_id: number
  full_name: string
  permit_number: string
  full_address: string
  city: string
  postal_code: string
  phone_number: string
  email: string
  contract_number: number
  dob: string
  status: string
  user_defined_contract_number: number | null
}

export async function searchStudents(query: string): Promise<StudentRecord[]> {
  const db = await getPool()
  const searchTerm = `%${query}%`

  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT student_id, full_name, permit_number, full_address, city, postal_code,
            phone_number, email, contract_number, dob, status, user_defined_contract_number
     FROM student
     WHERE full_name LIKE ? OR permit_number LIKE ? OR phone_number LIKE ? OR CAST(contract_number AS CHAR) LIKE ?
     ORDER BY full_name ASC
     LIMIT 20`,
    [searchTerm, searchTerm, searchTerm, searchTerm]
  )

  return rows as StudentRecord[]
}

export async function getStudentById(id: number): Promise<StudentRecord | null> {
  const db = await getPool()

  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT student_id, full_name, permit_number, full_address, city, postal_code,
            phone_number, email, contract_number, dob, status, user_defined_contract_number
     FROM student
     WHERE student_id = ?`,
    [id]
  )

  return (rows as StudentRecord[])[0] || null
}

export async function testConnection(): Promise<{ success: boolean; message: string; studentCount?: number }> {
  try {
    const db = await getPool()
    const [rows] = await db.execute<mysql.RowDataPacket[]>('SELECT COUNT(*) as count FROM student')
    const count = rows[0]?.count || 0
    return { success: true, message: `Connected. ${count} students found.`, studentCount: count }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Unknown error' }
  }
}
