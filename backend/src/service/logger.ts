import { createLogger, format, transports } from 'winston';
import { configService } from './config.service';
import { Request, Response as ExpressResponse, NextFunction } from 'express';

const logLevel = configService.get().logging.level;

export const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const levelStr = level.toUpperCase();
      const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
      let coloredLevel = levelStr;
      switch (level) {
        case 'error': coloredLevel = `\x1b[31m${levelStr}\x1b[0m`; break;
        case 'warn': coloredLevel = `\x1b[33m${levelStr}\x1b[0m`; break;
        case 'info': coloredLevel = `\x1b[36m${levelStr}\x1b[0m`; break;
        case 'debug': coloredLevel = `\x1b[32m${levelStr}\x1b[0m`; break;
      }
      return `${timestamp} [${coloredLevel}]: ${message} ${metaString}`;
    })
  ),
  transports: [
    new transports.Console(),
  ],
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