import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { initializeDatabase } from './db/schema.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({
    name: 'LiveMunshi API Backend',
    version: '1.0.0',
    database: 'PostgreSQL',
    status: 'online',
    endpoints: {
      health: 'GET /api/health',
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        refreshToken: 'POST /api/auth/refresh-token',
        logout: 'POST /api/auth/logout',
        forgotPassword: 'POST /api/auth/forgot-password',
        verifyResetOtp: 'POST /api/auth/forgot-password/verify-otp',
        resetPassword: 'POST /api/auth/reset-password',
        sendOtp: 'POST /api/auth/send-otp',
        verifyOtp: 'POST /api/auth/verify-otp',
        me: 'GET /api/auth/me'
      },
      khatas: {
        list: 'GET /api/khatas',
        create: 'POST /api/khatas',
        stats: 'GET /api/khatas/:id/stats'
      },
      parties: {
        list: 'GET /api/parties/khata/:khataId',
        create: 'POST /api/parties/khata/:khataId'
      },
      transactions: {
        list: 'GET /api/transactions/party/:partyId',
        create: 'POST /api/transactions'
      }
    }
  });
});

app.use('/api', apiRouter);
app.use(errorHandler);

async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ PostgreSQL Connected & Schema Verified');

    const server = app.listen(config.port, () => {
      console.log(`====================================================`);
      console.log(`🚀 LiveMunshi Backend running on port ${config.port}`);
      console.log(`📡 URL: http://localhost:${config.port}`);
      console.log(`🐘 Database: PostgreSQL (${config.databaseUrl.split('@')[1] || config.databaseUrl})`);
      console.log(`⚙️  Environment: ${config.nodeEnv}`);
      console.log(`====================================================`);
    });

    process.on('SIGTERM', () => server.close(() => process.exit(0)));
    process.on('SIGINT', () => server.close(() => process.exit(0)));
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err);
    process.exit(1);
  }
}

startServer();

export default app;
