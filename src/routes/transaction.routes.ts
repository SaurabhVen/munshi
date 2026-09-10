import { Router } from 'express';
import { transactionHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const transactionRouter = Router();
transactionRouter.use(authenticate);

transactionRouter.get('/party/:partyId', transactionHandler.getPartyTransactions);
transactionRouter.post('/', transactionHandler.createTransaction);
transactionRouter.get('/:id', transactionHandler.getTransaction);
transactionRouter.put('/:id', transactionHandler.updateTransaction);
transactionRouter.delete('/:id', transactionHandler.deleteTransaction);
