import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import path from 'path';

import swaggerSpec from './config/swagger';
import { requestLogger } from './middlewares/request-logger.middleware';
import { notFoundHandler } from './middlewares/not-found.middleware';
import { errorHandler } from './middlewares/error-handler.middleware';
import routes from './routes';

import config from './config';

/**
 * Creates and configures the Express application.
 */
const createApp = (): Application => {
  const app = express();

  // ── Security ────────────────────────────────────────────────────────────
  if (config.isProduction) {
    app.use(helmet());
  } else {
    // In dev, avoid strict CSP, HSTS, and COOP to allow local network testing over HTTP
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      hsts: false,
      originAgentCluster: false,
      frameguard: false,
    }));
  }
  app.use(
    cors({
      origin: '*', // Configure per environment in production
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Body Parsing ────────────────────────────────────────────────────────
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ── Static Files (Uploaded Videos) ──────────────────────────────────────
  app.use(
    '/uploads',
    (req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.resolve(process.cwd(), 'uploads'))
  );

  // ── Compression ─────────────────────────────────────────────────────────
  app.use(compression());

  // ── Request Logging ─────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Swagger Documentation ───────────────────────────────────────────────
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Content Management API Docs',
    })
  );

  // Expose raw OpenAPI spec as JSON
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // ── API Routes ──────────────────────────────────────────────────────────
  app.use('/api/v1', routes);

  // ── Error Handling ──────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
