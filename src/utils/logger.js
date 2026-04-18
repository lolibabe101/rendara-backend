const { createLogger, format, transports } = require('winston');
const env = require('../config/env');

const logger = createLogger({
  level: env.isDev ? 'debug' : 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    env.isDev
      ? format.combine(format.colorize(), format.simple())
      : format.json()
  ),
  transports: [new transports.Console()],
});

module.exports = logger;
