import { Router } from 'express';
import { recycleBinHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const recycleBinRouter = Router();
recycleBinRouter.use(authenticate);

recycleBinRouter.get('/:khataId', recycleBinHandler.viewRecycleBin);
recycleBinRouter.post('/:type/:id/restore', recycleBinHandler.restoreItem);
recycleBinRouter.delete('/:type/:id/purge', recycleBinHandler.purgeItem);
