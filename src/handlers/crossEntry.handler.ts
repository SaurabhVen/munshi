import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, transaction } from '../db/index.js';
import { AuthenticatedRequest } from '../types/index.js';

export const crossEntryHandler = {
  // List transfers in Khata
  async listCrossEntries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khataId } = req.params;

      const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [khataId, req.user!.user_id]);
      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      const logs = await queryAll(`
        SELECT * FROM audit_logs
        WHERE entity_type = 'CROSS_ENTRY' AND user_id = ?
        ORDER BY created_at DESC
      `, [req.user!.user_id]);

      res.json({ success: true, count: logs.length, data: logs });
    } catch (err) {
      next(err);
    }
  },

  // Perform atomic party-to-party debt transfer
  async createCrossEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khata_id, from_customer_id, to_customer_id, amount, description } = req.body;

      if (!khata_id || !from_customer_id || !to_customer_id || !amount) {
        res.status(400).json({ success: false, message: 'khata_id, from_customer_id, to_customer_id, and amount are required.' });
        return;
      }

      if (from_customer_id === to_customer_id) {
        res.status(400).json({ success: false, message: 'From Customer and To Customer cannot be the same.' });
        return;
      }

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ success: false, message: 'Transfer amount must be a positive number.' });
        return;
      }

      // Verify that this Khata belongs to the logged-in user
      const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [khata_id, req.user!.user_id]);
      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found or you do not have permission to access it.' });
        return;
      }

      const fromCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, c.customer_name FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND kc.khata_id = ? AND kc.is_active = true
      `, [from_customer_id, from_customer_id, khata_id]);

      const toCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, c.customer_name FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND kc.khata_id = ? AND kc.is_active = true
      `, [to_customer_id, to_customer_id, khata_id]);

      if (!fromCust || !toCust) {
        res.status(404).json({ success: false, message: 'One or both customers not found in this Khata.' });
        return;
      }

      const crossId = crypto.randomUUID();
      const fromTxnId = crypto.randomUUID();
      const toTxnId = crypto.randomUUID();
      const refNum = `XFER-${Date.now().toString().slice(-6)}`;

      await transaction(async (client) => {
        // 1. DENE entry for fromCustomer (Debit)
        await client.query(`
          INSERT INTO transactions (transaction_id, khata_customer_id, created_by, transaction_type, amount, description, reference_number)
          VALUES ($1, $2, $3, 'DENE', $4, $5, $6)
        `, [fromTxnId, fromCust.khata_customer_id, req.user!.user_id, numAmount, `Transferred to ${toCust.customer_name} (${description || ''})`, refNum]);

        // 2. LENE entry for toCustomer (Credit)
        await client.query(`
          INSERT INTO transactions (transaction_id, khata_customer_id, created_by, transaction_type, amount, description, reference_number)
          VALUES ($1, $2, $3, 'LENE', $4, $5, $6)
        `, [toTxnId, toCust.khata_customer_id, req.user!.user_id, numAmount, `Transferred from ${fromCust.customer_name} (${description || ''})`, refNum]);

        // 3. Log in audit_logs
        await client.query(`
          INSERT INTO audit_logs (user_id, entity_type, entity_id, action, new_data)
          VALUES ($1, 'CROSS_ENTRY', $2, 'TRANSFER', $3)
        `, [req.user!.user_id, crossId, JSON.stringify({
          from: fromCust.customer_name,
          to: toCust.customer_name,
          amount: numAmount,
          reference: refNum
        })]);
      });

      res.status(201).json({
        success: true,
        message: `Successfully transferred ₹${numAmount.toFixed(2)} from ${fromCust.customer_name} to ${toCust.customer_name}.`,
        data: {
          transfer_id: crossId,
          reference_number: refNum,
          amount: numAmount,
          from_customer: fromCust.customer_name,
          to_customer: toCust.customer_name
        }
      });
    } catch (err) {
      next(err);
    }
  }
};
