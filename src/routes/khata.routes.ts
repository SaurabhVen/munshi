import { Router } from 'express';
import { khataHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const khataRouter = Router();
khataRouter.use(authenticate);

khataRouter.get('/', khataHandler.listKhatas);
khataRouter.post('/', khataHandler.createKhata);
khataRouter.get('/:id', khataHandler.getKhata);
khataRouter.put('/:id', khataHandler.updateKhata);
khataRouter.delete('/:id', khataHandler.deleteKhata);
khataRouter.get('/:id/stats', khataHandler.getKhataStats);
