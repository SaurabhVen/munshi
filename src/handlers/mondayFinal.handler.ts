import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, transaction } from '../db/index.js';
import { AuthenticatedRequest } from '../types/index.js';

export const mondayFinalHandler = {
  // Get settlement history
  async listMondayFinals(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khataId } = req.params;

      const logs = await queryAll(`
        SELECT * FROM audit_logs
        WHERE entity_type = 'MONDAY_FINAL' AND user_id = ?
        ORDER BY created_at DESC
      `, [req.user!.user_id]);

      res.json({ success: true, count: logs.length, data: logs });
    } catch (err) {
      next(err);
    }
  },

  // Lock & freeze past transactions for a customer (Monday Final)
  async executeMondayFinal(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khata_customer_id, party_id, customer_id, settlement_date } = req.body;
      const targetId = khata_customer_id || party_id || customer_id;

      if (!targetId) {
        res.status(400).json({ success: false, message: 'khata_customer_id is required.' });
        return;
      }

      const khataCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, kc.khata_id, c.customer_name
        FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
      `, [targetId, targetId, req.user!.user_id]);

      if (!khataCust) {
        res.status(404).json({ success: false, message: 'Customer not found.' });
        return;
      }

      const balanceRow = await queryOne<any>(`
        SELECT net_balance FROM v_khata_customer_balances WHERE khata_customer_id = ?
      `, [khataCust.khata_customer_id]);

      const currentBalance = balanceRow ? Number(balanceRow.net_balance) : 0;
      const settlementDate = settlement_date || new Date().toISOString().split('T')[0];
      const finalId = crypto.randomUUID();

      await transaction(async (client) => {
        await client.query(`
          INSERT INTO audit_logs (user_id, entity_type, entity_id, action, new_data)
          VALUES ($1, 'MONDAY_FINAL', $2, 'SETTLEMENT_LOCK', $3)
        `, [req.user!.user_id, finalId, JSON.stringify({
          khata_customer_id: khataCust.khata_customer_id,
          customer_name: khataCust.customer_name,
          final_balance: currentBalance,
          settlement_date: settlementDate
        })]);
      });

      res.json({
        success: true,
        message: `Monday Final executed for ${khataCust.customer_name}. Ledger balance settled at ₹${currentBalance.toFixed(2)}.`,
        data: {
          settlement_id: finalId,
          customer_name: khataCust.customer_name,
          final_balance: currentBalance,
          settlement_date: settlementDate
        }
      });
    } catch (err) {
      next(err);
    }
  }
};
