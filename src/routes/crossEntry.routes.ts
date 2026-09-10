import { Router } from 'express';
import { crossEntryHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const crossEntryRouter = Router();
crossEntryRouter.use(authenticate);

crossEntryRouter.get('/khata/:khataId', crossEntryHandler.listCrossEntries);
crossEntryRouter.post('/', crossEntryHandler.createCrossEntry);
