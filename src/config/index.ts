import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.ENV_FILE || path.resolve('/home/saurabh-mishra/Desktop/livemunshi/.env');
dotenv.config({ path: envPath });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://zitadel:zitadel_password@localhost:5432/zitadel',
  jwtSecret: process.env.JWT_SECRET || 'livemunshi_super_secret_jwt_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'livemunshi_refresh_token_super_secret_2026',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
