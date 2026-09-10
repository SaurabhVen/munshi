import { Response, NextFunction } from 'express';
import { queryOne, queryAll } from '../db/index.js';
import { AuthenticatedRequest, Transaction } from '../types/index.js';

export const reportHandler = {
  // Customer Ledger Statement for print / PDF / WhatsApp
  async getPartyStatement(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { partyId } = req.params;
      const { start_date, end_date } = req.query;

      const khataCust = await queryOne<any>(`
        SELECT kc.khata_customer_id, c.customer_name, c.mobile_number, c.address, k.khata_name, u.mobile_number as owner_mobile
        FROM khata_customers kc
        JOIN customers c ON kc.customer_id = c.customer_id
        JOIN khatas k ON kc.khata_id = k.khata_id
        JOIN users u ON k.user_id = u.user_id
        WHERE (kc.khata_customer_id = ? OR kc.customer_id = ?) AND k.user_id = ?
      `, [partyId, partyId, req.user!.user_id]);

      if (!khataCust) {
        res.status(404).json({ success: false, message: 'Customer not found.' });
        return;
      }

      let openingBalance = 0;
      if (start_date && typeof start_date === 'string') {
        const priorTxns = await queryAll<Transaction>(`
          SELECT transaction_type, amount FROM transactions
          WHERE khata_customer_id = ? AND transaction_date < ?
        `, [khataCust.khata_customer_id, start_date]);

        for (const t of priorTxns) {
          openingBalance += t.transaction_type === 'LENE' ? Number(t.amount) : -Number(t.amount);
        }
      }

      let sql = `SELECT * FROM transactions WHERE khata_customer_id = ?`;
      const params: any[] = [khataCust.khata_customer_id];

      if (start_date && typeof start_date === 'string') {
        sql += ` AND transaction_date >= ?`;
        params.push(start_date);
      }
      if (end_date && typeof end_date === 'string') {
        sql += ` AND transaction_date <= ?`;
        params.push(end_date);
      }

      sql += ` ORDER BY transaction_date ASC, created_at ASC`;
      const periodTxns = await queryAll<Transaction>(sql, params);

      let currentRunning = openingBalance;
      const items = periodTxns.map((t) => {
        const amt = Number(t.amount);
        if (t.transaction_type === 'LENE') {
          currentRunning += amt;
        } else {
          currentRunning -= amt;
        }
        return {
          id: t.transaction_id,
          date: t.transaction_date,
          type: t.transaction_type,
          amount: amt,
          description: t.description,
          reference: t.reference_number,
          balance: Math.round(currentRunning * 100) / 100
        };
      });

      const periodLene = periodTxns.filter(t => t.transaction_type === 'LENE').reduce((sum, t) => sum + Number(t.amount), 0);
      const periodDene = periodTxns.filter(t => t.transaction_type === 'DENE').reduce((sum, t) => sum + Number(t.amount), 0);
      const closingBalance = Math.round(currentRunning * 100) / 100;

      const balanceNote = closingBalance > 0
        ? `Pending to receive: ₹${closingBalance.toFixed(2)}`
        : closingBalance < 0
        ? `Pending to pay: ₹${Math.abs(closingBalance).toFixed(2)}`
        : `All accounts clear (₹0.00)`;

      const whatsappMessage = `*Statement from ${khataCust.khata_name}*\nDear ${khataCust.customer_name},\nYour ledger account summary:\nOpening Balance: ₹${openingBalance.toFixed(2)}\nTotal Received: ₹${periodLene.toFixed(2)}\nTotal Given: ₹${periodDene.toFixed(2)}\n*Closing Balance:* ${balanceNote}\nThank you!`;

      res.json({
        success: true,
        data: {
          business: {
            khata_name: khataCust.khata_name,
            owner_mobile: khataCust.owner_mobile
          },
          customer: {
            customer_name: khataCust.customer_name,
            mobile_number: khataCust.mobile_number,
            address: khataCust.address
          },
          period: {
            start_date: start_date || 'Beginning',
            end_date: end_date || 'Present'
          },
          summary: {
            opening_balance: openingBalance,
            total_received_lene: periodLene,
            total_given_dene: periodDene,
            closing_balance: closingBalance,
            status: closingBalance >= 0 ? 'YOU_WILL_GET' : 'YOU_WILL_GIVE'
          },
          transactions: items,
          whatsapp_share_text: whatsappMessage,
          whatsapp_url: `https://wa.me/91${khataCust.mobile_number || ''}?text=${encodeURIComponent(whatsappMessage)}`
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Overall Khata summary
  async getKhataSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { khataId } = req.params;

      const khata = await queryOne('SELECT khata_id, khata_name FROM khatas WHERE khata_id = ? AND user_id = ? AND is_active = true', [khataId, req.user!.user_id]);
      if (!khata) {
        res.status(404).json({ success: false, message: 'Khata not found.' });
        return;
      }

      const rows = await queryAll<any>('SELECT * FROM v_khata_customer_balances WHERE khata_id = ?', [khataId]);

      const totalLene = rows.reduce((sum, r) => sum + Number(r.total_lene), 0);
      const totalDene = rows.reduce((sum, r) => sum + Number(r.total_dene), 0);
      const totalYouWillGet = rows.filter(r => Number(r.net_balance) > 0).reduce((sum, r) => sum + Number(r.net_balance), 0);
      const totalYouWillGive = rows.filter(r => Number(r.net_balance) < 0).reduce((sum, r) => sum + Math.abs(Number(r.net_balance)), 0);

      res.json({
        success: true,
        data: {
          khata_id: khata.khata_id,
          khata_name: khata.khata_name,
          total_customers: rows.length,
          total_credit_received: totalLene,
          total_debit_given: totalDene,
          total_you_will_get: totalYouWillGet,
          total_you_will_give: totalYouWillGive,
          net_ledger_balance: totalYouWillGet - totalYouWillGive
        }
      });
    } catch (err) {
      next(err);
    }
  }
};
