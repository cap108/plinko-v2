import pino from 'pino';

export const logger = pino({
  name: 'plinko-v2',
  level: process.env.LOG_LEVEL ?? 'info',
});
