import * as winston from 'winston';

const { combine, timestamp, printf, colorize, align, json } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  align(),
  printf(({ timestamp, level, message, context, ...meta }) => {
    const ctx = context ? ` [${context}]` : '';
    const extra = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} ${level}${ctx}: ${message}${extra}`;
  }),
);

const prodFormat = combine(timestamp(), json());

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: prodFormat,
    }),
    new winston.transports.File({
      filename: 'logs/app.log',
      format: prodFormat,
    }),
  ],
};
