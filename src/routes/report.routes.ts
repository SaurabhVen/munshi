import { Router } from 'express';
import { reportHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const reportRouter = Router();
reportRouter.use(authenticate);

reportRouter.get('/party/:partyId/statement', reportHandler.getPartyStatement);
reportRouter.get('/khata/:khataId/summary', reportHandler.getKhataSummary);
