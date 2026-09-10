import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { khataRouter } from './khata.routes.js';
import { partyRouter } from './party.routes.js';
import { transactionRouter } from './transaction.routes.js';
import { crossEntryRouter } from './crossEntry.routes.js';
import { mondayFinalRouter } from './mondayFinal.routes.js';
import { recycleBinRouter } from './recycleBin.routes.js';
import { reportRouter } from './report.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/khatas', khataRouter);
apiRouter.use('/parties', partyRouter);
apiRouter.use('/transactions', transactionRouter);
apiRouter.use('/cross-entries', crossEntryRouter);
apiRouter.use('/monday-final', mondayFinalRouter);
apiRouter.use('/recycle-bin', recycleBinRouter);
apiRouter.use('/reports', reportRouter);

// Health check
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'LiveMunshi API Backend',
    timestamp: new Date().toISOString()
  });
});
