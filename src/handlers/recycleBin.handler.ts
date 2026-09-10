import { Response, NextFunction } from 'express';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';
import { AuthenticatedRequest } from '../types/index.js';

export const recycleBinHandler = {
  // View all archived / inactive items in Recycle Bin
  async viewRecycleBin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khataId } = req.params;

      // Verify that this Khata belongs to the logged-in user
      const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ?', [khataId, req.user!.user_id]);
      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found or you do not have permission to access it.' });
        return;
      }

      const deletedCustomers = await queryAll(`
        SELECT kc.khata_customer_id, kc.customer_id, c.customer_name, c.mobile_number, kc.updated_at as deleted_at
        FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        WHERE kc.khata_id = ? AND kc.is_active = false
        ORDER BY kc.updated_at DESC
      `, [khataId]);

      const deletedKhatas = await queryAll(`
        SELECT khata_id, khata_name, updated_at as deleted_at
        FROM khatas
        WHERE user_id = ? AND is_active = false
        ORDER BY updated_at DESC
      `, [req.user!.user_id]);

      res.json({
        success: true,
        data: {
          customers: deletedCustomers,
          khatas: deletedKhatas
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Restore item (is_active = true)
  async restoreItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, id } = req.params;

      if (type === 'customer' || type === 'party') {
        const cust = await queryOne<any>(`
          SELECT kc.khata_customer_id FROM khata_customers kc
          JOIN khatas k ON kc.khata_id = k.khata_id
          WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
        `, [id, id, req.user!.user_id]);

        if (!cust) {
          res.status(404).json({ success: false, message: 'Customer not found or unauthorized.' });
          return;
        }

        await execute('UPDATE khata_customers SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE khata_customer_id = ?', [cust.khata_customer_id]);
        res.json({ success: true, message: 'Customer restored successfully.' });
        return;
      }

      if (type === 'khata') {
        const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ?', [id, req.user!.user_id]);
        if (!khata) {
          res.status(404).json({ success: false, message: 'Khata not found or unauthorized.' });
          return;
        }

        await execute('UPDATE khatas SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE khata_id = ? AND user_id = ?', [id, req.user!.user_id]);
        res.json({ success: true, message: 'Khata restored successfully.' });
        return;
      }

      res.status(400).json({ success: false, message: "Invalid type. Must be 'customer' or 'khata'." });
    } catch (err) {
      next(err);
    }
  },

  // Permanent purge
  async purgeItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, id } = req.params;

      if (type === 'customer' || type === 'party') {
        const cust = await queryOne<any>(`
          SELECT kc.khata_customer_id, kc.customer_id FROM khata_customers kc
          JOIN khatas k ON kc.khata_id = k.khata_id
          WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
        `, [id, id, req.user!.user_id]);

        if (!cust) {
          res.status(404).json({ success: false, message: 'Customer not found or unauthorized.' });
          return;
        }

        await transaction(async (client) => {
          await client.query('DELETE FROM transactions WHERE customer_id = $1', [cust.customer_id]);
          await client.query('DELETE FROM khata_customers WHERE khata_customer_id = $1', [cust.khata_customer_id]);
        });
        res.json({ success: true, message: 'Customer record permanently deleted.' });
        return;
      }

      if (type === 'khata') {
        const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ?', [id, req.user!.user_id]);
        if (!khata) {
          res.status(404).json({ success: false, message: 'Khata not found or unauthorized.' });
          return;
        }

        await transaction(async (client) => {
          await client.query('DELETE FROM transactions WHERE khata_id = $1', [id]);
          await client.query('DELETE FROM khata_customers WHERE khata_id = $1', [id]);
          await client.query('DELETE FROM khatas WHERE khata_id = $1 AND user_id = $2', [id, req.user!.user_id]);
        });
        res.json({ success: true, message: 'Khata permanently purged.' });
        return;
      }

      res.status(400).json({ success: false, message: "Invalid type. Must be 'customer' or 'khata'." });
    } catch (err) {
      next(err);
    }
  }
};
