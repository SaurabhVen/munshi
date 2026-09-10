import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne, queryAll, execute } from '../db/index.js';
import { AuthenticatedRequest, Khata, KhataStats } from '../types/index.js';

export const khataHandler = {
  // List all active Khatas for user
  async listKhatas(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const khatas = await queryAll<Khata>(`
        SELECT khata_id, user_id, khata_name, description, is_active, created_at, updated_at
        FROM khatas
        WHERE user_id = ? AND is_active = true
        ORDER BY created_at ASC
      `, [req.user!.user_id]);

      res.json({ success: true, count: khatas.length, data: khatas });
    } catch (err) {
      next(err);
    }
  },

  // Create a new Khata book
  async createKhata(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khata_name, description } = req.body;

      if (!khata_name || !khata_name.trim()) {
        res.status(400).json({ success: false, message: 'khata_name is required.' });
        return;
      }

      const name = khata_name.trim().substring(0, 100);
      const desc = description ? description.trim().substring(0, 500) : null;
      const khataId = crypto.randomUUID();

      await execute(`
        INSERT INTO khatas (khata_id, user_id, khata_name, description, is_active)
        VALUES (?, ?, ?, ?, true)
      `, [khataId, req.user!.user_id, name, desc]);

      const createdKhata = await queryOne<Khata>('SELECT * FROM khatas WHERE khata_id = ?', [khataId]);
      res.status(201).json({ success: true, message: 'Khata created successfully', data: createdKhata });
    } catch (err) {
      next(err);
    }
  },

  // Get details of a single Khata
  async getKhata(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const khata = await queryOne<Khata>(`
        SELECT * FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true
      `, [req.params.id, req.user!.user_id]);

      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      res.json({ success: true, data: khata });
    } catch (err) {
      next(err);
    }
  },

  // Update Khata name/description
  async updateKhata(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khata_name, description } = req.body;
      const khata = await queryOne<Khata>('SELECT * FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [req.params.id, req.user!.user_id]);

      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      const updatedName = khata_name ? khata_name.trim().substring(0, 100) : khata.khata_name;
      const updatedDesc = description !== undefined ? (description ? description.trim().substring(0, 500) : null) : khata.description;

      await execute(`
        UPDATE khatas
        SET khata_name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE khata_id = ?
      `, [updatedName, updatedDesc, khata.khata_id]);

      const updated = await queryOne<Khata>('SELECT * FROM khatas WHERE khata_id = ?', [khata.khata_id]);
      res.json({ success: true, message: 'Khata updated successfully', data: updated });
    } catch (err) {
      next(err);
    }
  },

  // Soft-delete Khata (is_active = false)
  async deleteKhata(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const khata = await queryOne<Khata>('SELECT * FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [req.params.id, req.user!.user_id]);

      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      await execute(`
        UPDATE khatas
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE khata_id = ?
      `, [khata.khata_id]);

      res.json({ success: true, message: 'Khata archived successfully.' });
    } catch (err) {
      next(err);
    }
  },

  // Get Khata overview stats (You Will Get / You Will Give)
  async getKhataStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const khata = await queryOne<Khata>('SELECT * FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [req.params.id, req.user!.user_id]);

      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      const stats = await queryOne<KhataStats>(`
        SELECT * FROM v_khata_stats WHERE khata_id = ?
      `, [khata.khata_id]);

      const result = stats || {
        khata_id: khata.khata_id,
        user_id: khata.user_id,
        khata_name: khata.khata_name,
        total_customers: 0,
        total_you_will_get: 0,
        total_you_will_give: 0
      };

      const getVal = Number(result.total_you_will_get) || 0;
      const giveVal = Number(result.total_you_will_give) || 0;
      const netBalance = getVal - giveVal;

      res.json({
        success: true,
        data: {
          ...result,
          total_you_will_get: getVal,
          total_you_will_give: giveVal,
          net_balance: netBalance,
          net_status: netBalance >= 0 ? 'YOU_WILL_GET' : 'YOU_WILL_GIVE'
        }
      });
    } catch (err) {
      next(err);
    }
  }
};
