import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface Config {
  port: number;
  nodeEnv: string;
  logLevel: string;
  isProduction: boolean;
  isDevelopment: boolean;
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  hashSaltRound: number;
  geminiApiKey: string;
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  hashSaltRound: Number(process.env.HASH_SALT_ROUND) || 10,
  geminiApiKey: process.env.GEMINI_API_KEY || ''
};

export default config;
