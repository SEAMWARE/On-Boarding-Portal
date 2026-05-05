import express from 'express';
import { configService } from './service/config.service';
import { logger, requestLogger } from './service/logger';
import path from 'path';
import ejs from 'ejs';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase } from './service/data.source';

import oidcController from './controller/openid.controller';
import registrationController from './controller/registration.controller';
import adminRegistrationController from './controller/admin-registration.controller';

import cookieParser from 'cookie-parser';
import { forwardedMiddleware } from './middleware/forwarded.middleware';


const appServer = express();

const { server, app } = configService.get();
const angularDistPath = path.join(__dirname, server.staticPath);
const indexPath = path.join(angularDistPath, 'index.html');

appServer.set('trust proxy', server.trustProxy);
appServer.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
    },
  },
}));
appServer.use(cors(server.cors))
appServer.use(express.json({ limit: server.jsonBodyLimit }))
appServer.disable('x-powered-by');
appServer.use(requestLogger);
appServer.use(express.static(angularDistPath, { index: false }));
appServer.set('trust proxy', true);
appServer.use(cookieParser())
appServer.use(forwardedMiddleware);

// Health check route
appServer.get('/health/live', (_, res) => {
  res.status(200).json({
    status: 'ALIVE',
    timestamp: new Date().toISOString()
  });
});


appServer.get('/health/ready', async (_, res) => {
  try {
    const isDatabaseReady = (await initializeDatabase()).isInitialized;
    if (isDatabaseReady) {
      res.status(200).json({ status: 'READY' });
    } else {
      res.status(503).json({ status: 'NOT_READY', reason: 'Database connection failed' });
    }
  } catch (error) {
    logger.error('Error checking database status', error);
    res.status(503).json({ status: 'NOT_READY', reason: 'Database connection failed' });
  }

});

// login
appServer.use('/api', oidcController, registrationController, adminRegistrationController)

let renderedIndex: string;
appServer.use((_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.send(renderedIndex);
});


(async () => {
  try {
    renderedIndex = await ejs.renderFile(indexPath, {
      documentToSignUrl: app.documentToSignUrl,
      didCreationEnabled: app.keycloak.didCreationEnabled
    });
    await initializeDatabase()
  } catch (error) {
    logger.error('Error connecting to the database', error);
    process.exit(1);
  }

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
})();