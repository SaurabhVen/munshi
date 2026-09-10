import { pool, queryOne, queryAll } from '../db/index.js';
import { initializeDatabase } from '../db/schema.js';
import { Khata } from '../types/index.js';

async function runTest() {
  try {
    console.log('--- Testing LiveMunshi Custom PostgreSQL Schema ---');
    await initializeDatabase();

    // 1. Check user
    const user = await queryOne('SELECT user_id, mobile_number, status FROM users LIMIT 1');
    console.log('1. User:', user);

    // 2. Check Khatas
    const khatas = await queryAll<Khata>('SELECT * FROM khatas WHERE is_active = true');
    console.log('2. Active Khatas:', khatas.map((k: Khata) => ({ khata_id: k.khata_id, khata_name: k.khata_name })));

    // 3. Check Stats for first khata
    if (khatas.length > 0) {
      const mainKhataId = khatas[0].khata_id;
      const stats = await queryOne('SELECT * FROM v_khata_stats WHERE khata_id = ?', [mainKhataId]);
      console.log('3. Khata Stats:', stats);

      // 4. Check Customers with Balances
      const customers = await queryAll('SELECT customer_name, mobile_number, total_lene, total_dene, net_balance FROM v_khata_customer_balances WHERE khata_id = ?', [mainKhataId]);
      console.log('4. Customers in Khata:', customers);
    }

    // 5. Check Transactions for Suresh Kumar
    const suresh = await queryOne('SELECT * FROM customers WHERE customer_name ILIKE ?', ['%Suresh%']);
    if (suresh) {
      const txns = await queryAll(`
        SELECT t.amount, t.transaction_type, t.description, t.transaction_date
        FROM transactions t
        JOIN khata_customers kc ON t.khata_customer_id = kc.khata_customer_id
        WHERE kc.customer_id = ?
        ORDER BY t.transaction_date ASC
      `, [suresh.customer_id]);
      console.log('5. Suresh Transactions:', txns);
    }

    console.log('--- All Custom PostgreSQL Schema queries tested successfully! ---');
  } catch (err) {
    console.error('Error during PostgreSQL test:', err);
  } finally {
    await pool.end();
  }
}

runTest();
