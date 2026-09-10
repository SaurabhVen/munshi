import { Router } from 'express';
import { partyHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const partyRouter = Router();
partyRouter.use(authenticate);

partyRouter.get('/khata/:khataId', partyHandler.listParties);
partyRouter.post('/khata/:khataId', partyHandler.createParty);
partyRouter.get('/:id', partyHandler.getParty);
partyRouter.put('/:id', partyHandler.updateParty);
partyRouter.delete('/:id', partyHandler.deleteParty);
