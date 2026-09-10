import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';
import { AuthenticatedRequest, Transaction, TransactionWithBalance } from '../types/index.js';

export const transactionHandler = {
  // Get Customer's ledger transactions with running balance
  async getPartyTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { partyId } = req.params; // Can be khata_customer_id or customer_id

      const khataCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, kc.khata_id, c.customer_name, c.mobile_number, k.khata_name
        FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
      `, [partyId, partyId, req.user!.user_id]);

      if (!khataCust) {
        res.status(404).json({ success: false, message: 'Customer ledger not found.' });
        return;
      }

      const txns = await queryAll<Transaction>(`
        SELECT 
          transaction_id, khata_customer_id, created_by, transaction_type,
          amount, transaction_date, description, reference_number, created_at, updated_at
        FROM transactions
        WHERE khata_customer_id = ?
        ORDER BY transaction_date ASC, created_at ASC
      `, [khataCust.khata_customer_id]);

      let running = 0;
      const transactionsWithBalance: TransactionWithBalance[] = txns.map((t) => {
        const amt = Number(t.amount);
        if (t.transaction_type === 'LENE') {
          running += amt;
        } else {
          running -= amt;
        }
        return {
          ...t,
          running_balance: Math.round(running * 100) / 100,
          customer_name: khataCust.customer_name
        };
      });

      const totalLene = txns.filter(t => t.transaction_type === 'LENE').reduce((sum, t) => sum + Number(t.amount), 0);
      const totalDene = txns.filter(t => t.transaction_type === 'DENE').reduce((sum, t) => sum + Number(t.amount), 0);
      const netBalance = totalLene - totalDene;

      res.json({
        success: true,
        customer: {
          khata_customer_id: khataCust.khata_customer_id,
          customer_name: khataCust.customer_name,
          mobile_number: khataCust.mobile_number,
          khata_name: khataCust.khata_name,
          total_lene: totalLene,
          total_dene: totalDene,
          net_balance: netBalance,
          net_status: netBalance >= 0 ? 'YOU_WILL_GET' : 'YOU_WILL_GIVE'
        },
        count: transactionsWithBalance.length,
        data: [...transactionsWithBalance].reverse()
      });
    } catch (err) {
      next(err);
    }
  },

  // Create Transaction (LENE / DENE)
  async createTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khata_customer_id, party_id, customer_id, amount, transaction_type, txn_type, description, details, transaction_date, reference_number } = req.body;

      const targetId = khata_customer_id || party_id || customer_id;
      if (!targetId || !amount) {
        res.status(400).json({ success: false, message: 'khata_customer_id and amount are required.' });
        return;
      }

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
        return;
      }

      // Standardize transaction type: accept LENE/DENE or LENA/DENA
      let rawType = String(transaction_type || txn_type || '').toUpperCase();
      if (rawType === 'LENA') rawType = 'LENE';
      if (rawType === 'DENA') rawType = 'DENE';

      if (rawType !== 'LENE' && rawType !== 'DENE') {
        res.status(400).json({ success: false, message: "transaction_type must be either 'LENE' (You Will Get) or 'DENE' (You Will Give)." });
        return;
      }

      // Verify customer and ownership
      const khataCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, kc.khata_id, c.customer_name
        FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
      `, [targetId, targetId, req.user!.user_id]);

      if (!khataCust) {
        res.status(404).json({ success: false, message: 'Customer not found in your Khatas.' });
        return;
      }

      const transactionId = crypto.randomUUID();
      const desc = description || details || (rawType === 'LENE' ? 'Payment received' : 'Goods sold on credit');
      const dateVal = transaction_date ? new Date(transaction_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      await transaction(async (client) => {
        await client.query(`
          INSERT INTO transactions (
            transaction_id, khata_customer_id, created_by, transaction_type,
            amount, transaction_date, description, reference_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [transactionId, khataCust.khata_customer_id, req.user!.user_id, rawType, numAmount, dateVal, desc, reference_number || null]);

        // Insert into audit_logs
        await client.query(`
          INSERT INTO audit_logs (user_id, entity_type, entity_id, action, new_data)
          VALUES ($1, 'TRANSACTION', $2, 'CREATE', $3)
        `, [req.user!.user_id, transactionId, JSON.stringify({ amount: numAmount, type: rawType, customer: khataCust.customer_name })]);
      });

      const created = await queryOne<Transaction>('SELECT * FROM transactions WHERE transaction_id = ?', [transactionId]);
      const balanceRow = await queryOne<any>('SELECT net_balance FROM v_khata_customer_balances WHERE khata_customer_id = ?', [khataCust.khata_customer_id]);

      res.status(201).json({
        success: true,
        message: `Recorded ₹${numAmount.toFixed(2)} (${rawType === 'LENE' ? 'You Will Get' : 'You Will Give'})`,
        data: created,
        current_net_balance: balanceRow ? balanceRow.net_balance : 0
      });
    } catch (err) {
      next(err);
    }
  },

  // Get single transaction
  async getTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const txn = await queryOne<Transaction>(`
        SELECT t.* FROM transactions t
        JOIN khata_customers kc ON t.khata_customer_id = kc.khata_customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE t.transaction_id = ? AND k.user_id = ?
      `, [req.params.id, req.user!.user_id]);

      if (!txn) {
        res.status(404).json({ success: false, message: 'Transaction not found.' });
        return;
      }

      res.json({ success: true, data: txn });
    } catch (err) {
      next(err);
    }
  },

  // Update transaction
  async updateTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { amount, description, reference_number, transaction_date } = req.body;

      const txn = await queryOne<Transaction>(`
        SELECT t.* FROM transactions t
        JOIN khata_customers kc ON t.khata_customer_id = kc.khata_customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE t.transaction_id = ? AND k.user_id = ?
      `, [req.params.id, req.user!.user_id]);

      if (!txn) {
        res.status(404).json({ success: false, message: 'Transaction not found.' });
        return;
      }

      const updatedAmount = amount ? Number(amount) : txn.amount;
      const updatedDesc = description !== undefined ? description : txn.description;
      const updatedRef = reference_number !== undefined ? reference_number : txn.reference_number;
      const updatedDate = transaction_date || txn.transaction_date;

      await transaction(async (client) => {
        await client.query(`
          UPDATE transactions
          SET amount = $1, description = $2, reference_number = $3, transaction_date = $4, updated_at = CURRENT_TIMESTAMP
          WHERE transaction_id = $5
        `, [updatedAmount, updatedDesc, updatedRef, updatedDate, txn.transaction_id]);

        await client.query(`
          INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_data, new_data)
          VALUES ($1, 'TRANSACTION', $2, 'UPDATE', $3, $4)
        `, [req.user!.user_id, txn.transaction_id, JSON.stringify(txn), JSON.stringify({ amount: updatedAmount, description: updatedDesc })]);
      });

      const updated = await queryOne('SELECT * FROM transactions WHERE transaction_id = ?', [txn.transaction_id]);
      res.json({ success: true, message: 'Transaction updated successfully', data: updated });
    } catch (err) {
      next(err);
    }
  },

  // Delete transaction
  async deleteTransaction(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const txn = await queryOne<Transaction>(`
        SELECT t.* FROM transactions t
        JOIN khata_customers kc ON t.khata_customer_id = kc.khata_customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE t.transaction_id = ? AND k.user_id = ?
      `, [req.params.id, req.user!.user_id]);

      if (!txn) {
        res.status(404).json({ success: false, message: 'Transaction not found.' });
        return;
      }

      await transaction(async (client) => {
        await client.query('DELETE FROM transactions WHERE transaction_id = $1', [txn.transaction_id]);
        await client.query(`
          INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_data)
          VALUES ($1, 'TRANSACTION', $2, 'DELETE', $3)
        `, [req.user!.user_id, txn.transaction_id, JSON.stringify(txn)]);
      });

      res.json({ success: true, message: 'Transaction deleted.' });
    } catch (err) {
      next(err);
    }
  }
};
