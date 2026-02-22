const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
      multipleStatements: true,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : undefined,
    });
  }
  return pool;
}

async function callProc(name, params = []) {
  const placeholders = params.map(() => '?').join(',');
  const sql = `CALL ${name}(${placeholders})`;
  const db = getPool();
  const [results] = await db.execute(sql, params);
  return results;
}

async function callProcOne(name, params = []) {
  const results = await callProc(name, params);
  const rows = Array.isArray(results[0]) ? results[0] : results;
  return rows[0] || null;
}

module.exports = { callProc, callProcOne, getPool };
