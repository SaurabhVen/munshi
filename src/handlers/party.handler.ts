import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';
import { AuthenticatedRequest, KhataCustomerWithBalance } from '../types/index.js';

export const partyHandler = {
  // List customers with live net balance in Khata
  async listParties(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khataId } = req.params;
      const { search, filter, sort } = req.query;

      const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [khataId, req.user!.user_id]);
      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      let sql = `SELECT * FROM v_khata_customer_balances WHERE khata_id = ? AND is_active = true`;
      const params: any[] = [khataId];

      if (search && typeof search === 'string' && search.trim()) {
        sql += ` AND (customer_name ILIKE ? OR mobile_number ILIKE ?)`;
        const pattern = `%${search.trim()}%`;
        params.push(pattern, pattern);
      }

      if (filter === 'lene' || filter === 'lena') {
        sql += ` AND net_balance > 0`;
      } else if (filter === 'dene' || filter === 'dena') {
        sql += ` AND net_balance < 0`;
      } else if (filter === 'settled') {
        sql += ` AND net_balance = 0`;
      }

      if (sort === 'balance_desc') {
        sql += ` ORDER BY net_balance DESC`;
      } else if (sort === 'balance_asc') {
        sql += ` ORDER BY net_balance ASC`;
      } else if (sort === 'name') {
        sql += ` ORDER BY customer_name ASC`;
      } else {
        sql += ` ORDER BY COALESCE(last_activity_date, created_at) DESC NULLS LAST`;
      }

      const rows = await queryAll<KhataCustomerWithBalance>(sql, params);

      res.json({
        success: true,
        count: rows.length,
        data: rows
      });
    } catch (err) {
      next(err);
    }
  },

  // Add Customer to Khata
  async createParty(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khataId } = req.params;
      const { customer_name, name, mobile_number, phone_number, address } = req.body;
      const custName = (customer_name || name || '').trim();

      if (!custName) {
        res.status(400).json({ success: false, message: 'customer_name is required.' });
        return;
      }

      const khata = await queryOne('SELECT khata_id FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [khataId, req.user!.user_id]);
      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      const rawPhone = mobile_number || phone_number;
      const cleanPhone = rawPhone ? String(rawPhone).trim().replace(/\D/g, '').slice(-10) : null;
      const custAddress = address ? String(address).trim() : null;

      const customerId = crypto.randomUUID();
      const khataCustomerId = crypto.randomUUID();

      await transaction(async (client) => {
        await client.query(`
          INSERT INTO customers (customer_id, customer_name, mobile_number, address)
          VALUES ($1, $2, $3, $4)
        `, [customerId, custName.substring(0, 150), cleanPhone, custAddress]);

        await client.query(`
          INSERT INTO khata_customers (khata_customer_id, khata_id, customer_id, is_active)
          VALUES ($1, $2, $3, true)
        `, [khataCustomerId, khataId, customerId]);
      });

      const created = await queryOne<KhataCustomerWithBalance>(`
        SELECT * FROM v_khata_customer_balances WHERE khata_customer_id = ?
      `, [khataCustomerId]);

      res.status(201).json({
        success: true,
        message: 'Customer added to Khata',
        data: created
      });
    } catch (err) {
      next(err);
    }
  },

  // Get Customer by ID
  async getParty(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id;

      const customer = await queryOne<KhataCustomerWithBalance>(`
        SELECT kcb.* FROM v_khata_customer_balances kcb
        JOIN khatas k ON kcb.khata_id = k.khata_id
        WHERE (kcb.khata_customer_id = ? OR kcb.customer_id = ?) AND k.user_id = ?
      `, [id, id, req.user!.user_id]);

      if (!customer) {
        res.status(404).json({ success: false, message: 'Customer not found.' });
        return;
      }

      res.json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  },

  // Update Customer details
  async updateParty(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id;
      const { customer_name, name, mobile_number, phone_number, address } = req.body;

      const khataCust = await queryOne<any>(`
        SELECT kc.customer_id, k.user_id FROM khata_customers kc
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
      `, [id, id, req.user!.user_id]);

      if (!khataCust) {
        res.status(404).json({ success: false, message: 'Customer not found.' });
        return;
      }

      const existingCust = await queryOne<any>('SELECT * FROM customers WHERE customer_id = ?', [khataCust.customer_id]);
      const newName = (customer_name || name || existingCust.customer_name).trim().substring(0, 150);
      const rawPhone = mobile_number || phone_number;
      const newPhone = rawPhone !== undefined ? (rawPhone ? String(rawPhone).trim().replace(/\D/g, '').slice(-10) : null) : existingCust.mobile_number;
      const newAddress = address !== undefined ? (address ? String(address).trim() : null) : existingCust.address;

      await execute(`
        UPDATE customers
        SET customer_name = ?, mobile_number = ?, address = ?, updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?
      `, [newName, newPhone, newAddress, khataCust.customer_id]);

      const updated = await queryOne('SELECT * FROM customers WHERE customer_id = ?', [khataCust.customer_id]);
      res.json({ success: true, message: 'Customer updated successfully', data: updated });
    } catch (err) {
      next(err);
    }
  },

  // Soft-delete Customer from Khata (is_active = false)
  async deleteParty(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id;

      const khataCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, k.user_id FROM khata_customers kc
        JOIN khatas k ON kc.khata_id = k.khata_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
      `, [id, id, req.user!.user_id]);

      if (!khataCust) {
        res.status(404).json({ success: false, message: 'Customer not found.' });
        return;
      }

      await execute(`
        UPDATE khata_customers
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE khata_customer_id = ?
      `, [khataCust.khata_customer_id]);

      res.json({ success: true, message: 'Customer removed from Khata.' });
    } catch (err) {
      next(err);
    }
  }
};
