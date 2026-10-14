import pino from 'pino';
import type { Config } from './config.js';

export type Logger = pino.Logger;

export function createLogger(config: Pick<Config, 'LOG_LEVEL' | 'NODE_ENV' | 'NODE_ID'>): Logger {
  const pretty = config.NODE_ENV === 'development';
  return pino({
    level: config.LOG_LEVEL,
    base: { node: config.NODE_ID },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.token'],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}
