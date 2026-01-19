import express from 'express';
import { configService } from './services/config-service';
import { logger, requestLogger } from './services/logger';
import path from 'path';
import ejs from 'ejs';
import cors from 'cors';
const appServer = express();

const { server, app } = configService.get();
const angularDistPath = path.join(__dirname, server.staticPath);
const indexPath = path.join(angularDistPath, 'index.html');

appServer.use(cors(server.cors))
appServer.use(express.json())
appServer.disable('x-powered-by');
appServer.use(requestLogger);
appServer.use(express.static(angularDistPath));
appServer.set('trust proxy', true);


// Health check route
appServer.get('/', (_req, res) => {
  res.send('Server is running!');
});

appServer.use((_req, res) => {
  ejs.renderFile(indexPath, {...app}, (err, str) => {
    if (err) {
      logger.error(err);
      return res.status(500).send('Error rendering template');
    }
    res.send(str);
  })
});

const runningServer = appServer.listen(server.port, () => {
  logger.info(`Server running at http://localhost:${server.port}`);
});


const shutdown = () => {
  runningServer.close(() => {
    logger.info('HTTP server closed');
    logger.close();
    process.exit(0);
  });
}
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received: closing server gracefully');
  shutdown()
});

process.on('SIGINT', () => {
  logger.info('SIGINT received: exiting');
  shutdown()
});