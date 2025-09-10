const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'prices',
  user: process.env.DB_USER || 'priceuser',
  password: process.env.DB_PASSWORD || 'SecurePassword123!',
  // Proper PostgreSQL client encoding for Bulgarian text
  options: '--client_encoding=UTF8',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { 
      text: text.substring(0, 100), 
      params: params ? params.map(p => typeof p === 'string' ? `"${p}"` : p) : [], 
      duration, 
      rows: res.rowCount 
    });
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('Query failed', { 
      text: text.substring(0, 100), 
      params: params ? params.map(p => typeof p === 'string' ? `"${p}"` : p) : [], 
      duration, 
      error: error.message 
    });
    throw error;
  }
}

async function closeDB() {
  await pool.end();
}

module.exports = {
  query,
  closeDB,
  pool
};