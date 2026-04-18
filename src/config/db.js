const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: env.db.connectionString,
  ssl: env.db.ssl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  if (env.isDev) logger.debug('New DB client connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected DB pool error', { error: err.message });
});

/**
 * Execute a parameterised query.
 * @param {string} text  SQL string with $1, $2 … placeholders
 * @param {Array}  params
 */
const query = (text, params) => pool.query(text, params);

/**
 * Grab a dedicated client for transactions.
 * Remember to call client.release() in a finally block.
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
