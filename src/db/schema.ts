import { pool } from './index.js';

export async function initializeDatabase() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mobile_number VARCHAR(15) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        last_login_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_user_status
            CHECK (status IN ('ACTIVE', 'BLOCKED', 'DELETED'))
    );

    CREATE TABLE IF NOT EXISTS user_otp_verifications (
        otp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id),
        mobile_number VARCHAR(15) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        purpose VARCHAR(30) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        verified_at TIMESTAMP NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_otp_purpose
            CHECK (purpose IN ('REGISTRATION', 'LOGIN', 'FORGOT_PASSWORD', 'CHANGE_MOBILE'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
        session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id),
        refresh_token_hash VARCHAR(255) NOT NULL,
        device_info VARCHAR(500),
        ip_address INET,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP NULL,
        last_used_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS khatas (
        khata_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id),
        khata_name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
        customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name VARCHAR(150) NOT NULL,
        mobile_number VARCHAR(15),
        address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS khata_customers (
        khata_customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        khata_id UUID NOT NULL REFERENCES khatas(khata_id),
        customer_id UUID NOT NULL REFERENCES customers(customer_id),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_khata_customer UNIQUE (khata_id, customer_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        khata_customer_id UUID NOT NULL REFERENCES khata_customers(khata_customer_id),
        created_by UUID NOT NULL REFERENCES users(user_id),
        transaction_type VARCHAR(10) NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT,
        reference_number VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_transaction_type CHECK (transaction_type IN ('LENE', 'DENE')),
        CONSTRAINT chk_transaction_amount CHECK (amount > 0)
    );

    CREATE TABLE IF NOT EXISTS transaction_attachments (
        attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
        file_url VARCHAR(1000) NOT NULL,
        file_name VARCHAR(255),
        file_type VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        audit_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(user_id),
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(30) NOT NULL,
        old_data JSONB,
        new_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE OR REPLACE VIEW v_khata_customer_balances AS
    SELECT 
        kc.khata_customer_id,
        kc.khata_id,
        kc.customer_id,
        c.customer_name,
        c.mobile_number,
        c.address,
        kc.is_active,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'LENE' THEN t.amount ELSE 0 END), 0) AS total_lene,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'DENE' THEN t.amount ELSE 0 END), 0) AS total_dene,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'LENE' THEN t.amount ELSE -t.amount END), 0) AS net_balance,
        MAX(t.created_at) AS last_activity_date,
        kc.created_at
    FROM khata_customers kc
    JOIN customers c ON kc.customer_id = c.customer_id
    LEFT JOIN transactions t ON kc.khata_customer_id = t.khata_customer_id
    WHERE kc.is_active = TRUE
    GROUP BY kc.khata_customer_id, kc.khata_id, kc.customer_id, c.customer_name, c.mobile_number, c.address, kc.is_active, kc.created_at;

    CREATE OR REPLACE VIEW v_khata_stats AS
    SELECT 
        k.khata_id,
        k.user_id,
        k.khata_name,
        COUNT(DISTINCT kcb.customer_id) AS total_customers,
        COALESCE(SUM(CASE WHEN kcb.net_balance > 0 THEN kcb.net_balance ELSE 0 END), 0) AS total_you_will_get,
        COALESCE(SUM(CASE WHEN kcb.net_balance < 0 THEN ABS(kcb.net_balance) ELSE 0 END), 0) AS total_you_will_give
    FROM khatas k
    LEFT JOIN v_khata_customer_balances kcb ON k.khata_id = kcb.khata_id
    WHERE k.is_active = TRUE
    GROUP BY k.khata_id, k.user_id, k.khata_name;
  `);
}
