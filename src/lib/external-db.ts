import mysql from 'mysql2/promise'
import net from 'net'

// External MySQL database connection (driving_school_v2)
// In production (Docker on DO server): connects directly via host network
// In development (local Mac): connects via SSH tunnel

// NOTE: ssh2 is only imported dynamically in development to avoid
// native module compilation issues in the production Docker container

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

// SSH tunnel management (dev only)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sshTunnel: { server: net.Server; client: any } | null = null
let tunnelReady = false

async function ensureSSHTunnel(): Promise<void> {
  if (tunnelReady && sshTunnel) return

  const config = getConfig()
  if (!config.ssh) return // No SSH needed in production

  // Dynamic import of ssh2 — only needed in development
  const { Client: SSHClient } = await import('ssh2')
  const fs = await import('fs')

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: any, stream: any) => {
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
        passphrase: process.env.EXTERNAL_DB_SSH_PASSPHRASE,
      })
    })

    sshClient.on('ready', () => {
      console.log('[ExternalDB] SSH tunnel established')
      sshTunnel = { server, client: sshClient }
      tunnelReady = true
      resolve()
    })

    sshClient.on('error', (err: Error) => {
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

  // Set up SSH tunnel for development only
  if (config.ssh) {
    await ensureSSHTunnel()
  }

  if (!pool) {
    console.log(`[ExternalDB] Creating MySQL pool to ${config.mysql.host}:${config.mysql.port} db=${config.mysql.database}`)
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
    console.log(`[ExternalDB] MySQL pool created successfully`)
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

export async function countStudentsByDateRange(startDate: string, endDate: string): Promise<mysql.RowDataPacket[]> {
  const db = await getPool()
  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) as total,
            MIN(creation_date) as earliest,
            MAX(creation_date) as latest
     FROM student
     WHERE creation_date >= ? AND creation_date < ?`,
    [startDate, endDate]
  )
  return rows
}

export async function monthlyBreakdown(startDate: string, endDate: string): Promise<mysql.RowDataPacket[]> {
  const db = await getPool()
  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT DATE_FORMAT(creation_date, '%Y-%m') as month, COUNT(*) as count
     FROM student
     WHERE creation_date >= ? AND creation_date < ?
     GROUP BY month
     ORDER BY month`,
    [startDate, endDate]
  )
  return rows
}

export async function searchStudentsByPhones(phones: string[]): Promise<StudentRecord[]> {
  if (phones.length === 0) return []
  const db = await getPool()

  // Build WHERE clause: match last 10 digits of phone
  const conditions = phones
    .map(p => p.replace(/\D/g, '').slice(-10))
    .filter(p => p.length >= 7)

  if (conditions.length === 0) return []

  // Use LIKE for each phone to match flexibly
  const whereClauses = conditions.map(() => `phone_number LIKE ?`)
  const params = conditions.map(p => `%${p}%`)

  const [rows] = await db.execute<mysql.RowDataPacket[]>(
    `SELECT student_id, full_name, permit_number, full_address, city, postal_code,
            phone_number, email, contract_number, dob, status, user_defined_contract_number
     FROM student
     WHERE ${whereClauses.join(' OR ')}
     LIMIT 500`,
    params
  )

  return rows as StudentRecord[]
}

// Write operations

export interface CreateStudentData {
  full_name: string
  phone_number: string
  permit_number: string
  full_address: string
  city: string
  postal_code: string
  dob: string
  email: string
}

// Sanitize date to YYYY-MM-DD format for MySQL
function sanitizeDate(dateStr: string): string {
  if (!dateStr) return ''
  // Remove any non-digit/dash characters and try to parse
  const clean = dateStr.replace(/[^\d-]/g, '')
  // If already YYYY-MM-DD, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  // Try to extract 8 digits (YYYYMMDD) and format
  const digits = clean.replace(/-/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  }
  // Fallback: return as-is and let MySQL handle it
  return clean
}

export async function createStudent(data: CreateStudentData): Promise<{ insertId: number }> {
  const db = await getPool()
  const dob = sanitizeDate(data.dob)

  // student_id is not auto-increment — get next ID manually
  const [maxRows] = await db.execute<mysql.RowDataPacket[]>(
    'SELECT COALESCE(MAX(student_id), 0) + 1 AS next_id FROM student'
  )
  const nextId = (maxRows as mysql.RowDataPacket[])[0]?.next_id || 1

  await db.execute(
    `INSERT INTO student (student_id, full_name, phone_number, permit_number, full_address, city, postal_code, dob, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nextId, data.full_name, data.phone_number, data.permit_number, data.full_address, data.city, data.postal_code, dob, data.email]
  )
  return { insertId: nextId }
}

export async function updateStudent(id: number, data: Partial<CreateStudentData>): Promise<void> {
  const db = await getPool()

  // Build dynamic SET clause from provided fields only
  const allowedFields = ['full_name', 'phone_number', 'permit_number', 'full_address', 'city', 'postal_code', 'dob', 'email']
  const setClauses: string[] = []
  const values: (string | number)[] = []

  for (const field of allowedFields) {
    if (field in data && data[field as keyof CreateStudentData] !== undefined) {
      setClauses.push(`${field} = ?`)
      values.push(data[field as keyof CreateStudentData] as string)
    }
  }

  if (setClauses.length === 0) return

  values.push(id)
  await db.execute(
    `UPDATE student SET ${setClauses.join(', ')} WHERE student_id = ?`,
    values
  )
}
