import { Router } from 'express';
import { mondayFinalHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const mondayFinalRouter = Router();
mondayFinalRouter.use(authenticate);

mondayFinalRouter.get('/khata/:khataId', mondayFinalHandler.listMondayFinals);
mondayFinalRouter.post('/', mondayFinalHandler.executeMondayFinal);
