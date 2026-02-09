import { createLogger, format, transports } from 'winston';
import { configService } from './config.service';
import { Request, Response as ExpressResponse, NextFunction } from 'express';

const logLevel = configService.get().logging.level;
const COLORS: Record<string, string> = {
  error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[32m'
};
export const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const levelStr = level.toUpperCase();

      let coloredLevel = levelStr;
      if (COLORS[level]) coloredLevel = `${COLORS[level]}${levelStr}\x1b[0m`;

      const content = stack ? `${message}: ${stack}` : message;

      const metaData = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';

      return `${timestamp} [${coloredLevel}]: ${content} ${metaData}`;
    })
  ),
  transports: [new transports.Console()],
  exceptionHandlers: [new transports.Console()],
  rejectionHandlers: [new transports.Console()]
});


export function requestLogger(req: Request, res: ExpressResponse, next: NextFunction) {
  const start = process.hrtime();

  res.on('finish', () => {
    const durationHr = process.hrtime(start);
    const durationMs = (durationHr[0] * 1000 + durationHr[1] / 1e6).toFixed(2);

    const status = res.statusCode;
    if (req.originalUrl.includes('/health')) {
      logger.debug(`${req.method} ${req.originalUrl} ${status} ${durationMs}ms`);
    } else {
      logger.info(`${req.method} ${req.originalUrl} ${status} ${durationMs}ms`);
    }
  });

  next();
}


export function externalRequest(response: Response, url: string | URL, method: string, start: [number, number]) {
  const durationHr = process.hrtime(start);
  const durationMs = (durationHr[0] * 1000 + durationHr[1] / 1e6).toFixed(2);
  logger.info(`Output ${method.toUpperCase()} ${url} ${response.status} ${durationMs}ms`)
}