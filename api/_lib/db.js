const { sql, createPool } = require('@vercel/postgres');

let pool;
function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

module.exports = { sql, getPool };
