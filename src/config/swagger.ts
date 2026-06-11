import swaggerJSDoc from 'swagger-jsdoc';
import config from './index';

const swaggerDefinition: swaggerJSDoc.OAS3Definition = {
  openapi: '3.0.0',
  info: {
    title: 'Content Management API',
    version: '1.0.0',
    description:
      'Production-ready Content Management Backend API with Express.js and TypeScript',
    contact: {
      name: 'API Support',
    },
  },
  servers: [
    {
      url: `/api/v1`,
      description: 'Development Server',
    },
  ],
  components: {
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'Request successful' },
          data: { type: 'object', nullable: true },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2026-04-16T12:00:00.000Z',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          statusCode: { type: 'integer', example: 400 },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: { type: 'object' },
            nullable: true,
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter the device token provided by the /device/register endpoint.',
      },
      accessAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'IMPORTANT: Enter "Access <token>". Example: Access eyJhbGci...',
      },
    },
  },
};

const swaggerOptions: swaggerJSDoc.Options = {
  swaggerDefinition,
  apis: [
    // Scan route files for JSDoc/Swagger annotations
    './src/modules/**/*.route.ts',
    './src/modules/**/*.routes.ts',
    './src/modules/**/*.validation.ts',
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export default swaggerSpec;
