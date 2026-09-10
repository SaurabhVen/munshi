BEGIN TRANSACTION;
CREATE TABLE cross_entries (
    id TEXT PRIMARY KEY,
    khata_id TEXT NOT NULL,
    from_party_id TEXT NOT NULL,
    to_party_id TEXT NOT NULL,
    amount DECIMAL(11, 2) NOT NULL CHECK (amount > 0),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (khata_id) REFERENCES khatas(id) ON DELETE CASCADE,
    FOREIGN KEY (from_party_id) REFERENCES parties(id),
    FOREIGN KEY (to_party_id) REFERENCES parties(id)
);
CREATE TABLE khatas (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,                   -- 1 = Active, 0 = In Recycle Bin, -1 = Deleted
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO "khatas" VALUES('b003cfee-f01a-4304-b62b-f1f32597dafd','067a8dce-4993-4e66-8790-21200cf71eb7','Main Shop Khata',1,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "khatas" VALUES('c9b96862-aac6-4e7b-9e3f-348d5805bf1a','067a8dce-4993-4e66-8790-21200cf71eb7','Personal Expenses',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
CREATE TABLE monday_finals (
    id TEXT PRIMARY KEY,
    khata_id TEXT NOT NULL,
    party_id TEXT NOT NULL,
    final_balance DECIMAL(12, 2) NOT NULL,
    settlement_date DATE DEFAULT (DATE('now')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (khata_id) REFERENCES khatas(id) ON DELETE CASCADE,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);
CREATE TABLE otp_verifications (
    id TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used INTEGER DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE parties (
    id TEXT PRIMARY KEY,
    khata_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT,
    address TEXT,
    is_finalized INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,                   -- 1 = Active, 0 = In Recycle Bin, -1 = Deleted
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (khata_id) REFERENCES khatas(id) ON DELETE CASCADE
);
INSERT INTO "parties" VALUES('ea3a5272-f4ba-49eb-a274-309f0f7d92b1','b003cfee-f01a-4304-b62b-f1f32597dafd','Suresh Kumar','9876543210','Shop #12, Market',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "parties" VALUES('1e368d5d-de47-4100-8a81-e494835d1171','b003cfee-f01a-4304-b62b-f1f32597dafd','Ramesh Sharma','9876543211','Sector 14, Main Road',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "parties" VALUES('9a8a30b6-f230-4137-86be-41873d1e8945','b003cfee-f01a-4304-b62b-f1f32597dafd','Priya Patel','9876543212','Block B, Green Avenue',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "parties" VALUES('7a9bf5e6-4a4b-4982-afdb-6db274be1574','b003cfee-f01a-4304-b62b-f1f32597dafd','Anil Mehta','9876543213','Civil Lines',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "parties" VALUES('4f7cefed-fdb5-44cc-aa1d-bf1678faa695','b003cfee-f01a-4304-b62b-f1f32597dafd','Sunita Devi','9876543214','Near City Tower',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "parties" VALUES('48f021d3-1105-40c5-b79c-b1ac00340309','b003cfee-f01a-4304-b62b-f1f32597dafd','Vikram Singh','9876543215','Grain Market #4',0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    khata_id TEXT NOT NULL,
    party_id TEXT NOT NULL,
    cross_entry_id TEXT,
    amount DECIMAL(11, 2) NOT NULL CHECK (amount > 0),
    txn_type TEXT NOT NULL CHECK (txn_type IN ('LENA', 'DENA')),
    details TEXT,
    is_confirmed INTEGER DEFAULT 1,
    is_finalized INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,                   -- 1 = Active, 0 = In Recycle Bin, -1 = Deleted
    deleted_at TIMESTAMP,
    txn_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (khata_id) REFERENCES khatas(id) ON DELETE CASCADE,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    FOREIGN KEY (cross_entry_id) REFERENCES cross_entries(id) ON DELETE SET NULL
);
INSERT INTO "transactions" VALUES('ba821842-dc1b-48f7-95b1-d226aacaeac3','b003cfee-f01a-4304-b62b-f1f32597dafd','ea3a5272-f4ba-49eb-a274-309f0f7d92b1',NULL,10000,'LENA','Goods sold on credit',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "transactions" VALUES('87fe8f5b-37b8-48ab-8c95-0f496ad2f0ef','b003cfee-f01a-4304-b62b-f1f32597dafd','ea3a5272-f4ba-49eb-a274-309f0f7d92b1',NULL,1500,'DENA','Partial cash received',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "transactions" VALUES('59abd6bb-b8e8-4e11-91b6-3a7b9d834e21','b003cfee-f01a-4304-b62b-f1f32597dafd','48f021d3-1105-40c5-b79c-b1ac00340309',NULL,36750,'LENA','Wholesale supply',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "transactions" VALUES('05533c64-9554-4873-bd20-9660c06f8a41','b003cfee-f01a-4304-b62b-f1f32597dafd','1e368d5d-de47-4100-8a81-e494835d1171',NULL,1200,'DENA','Packaging material supply',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "transactions" VALUES('39158790-01fc-4123-9d88-95517e78ef79','b003cfee-f01a-4304-b62b-f1f32597dafd','9a8a30b6-f230-4137-86be-41873d1e8945',NULL,5750,'DENA','Dairy wholesale vendor',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "transactions" VALUES('db1a116f-f578-4c21-8995-b7b520c7cd38','b003cfee-f01a-4304-b62b-f1f32597dafd','7a9bf5e6-4a4b-4982-afdb-6db274be1574',NULL,4300,'DENA','Transport delivery charges',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
INSERT INTO "transactions" VALUES('87c10af9-922c-4ac5-a46f-1f53b5cbb7de','b003cfee-f01a-4304-b62b-f1f32597dafd','4f7cefed-fdb5-44cc-aa1d-bf1678faa695',NULL,1150,'DENA','Store cleaning services',1,0,1,NULL,'2026-09-09 06:41:45','2026-09-09 06:41:45');
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL UNIQUE,
    country_code TEXT NOT NULL DEFAULT '+91',
    pin_hash TEXT NOT NULL,                     -- 4-digit PIN (hashed)
    app_lock_pin_hash TEXT,
    is_verified INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "users" VALUES('067a8dce-4993-4e66-8790-21200cf71eb7','9876543210','+91','pbkdf2:sha256:pin1234',NULL,1,1,'2026-09-09 06:41:45','2026-09-09 06:41:45');
CREATE INDEX idx_khatas_user ON khatas(user_id, status);
CREATE INDEX idx_parties_khata ON parties(khata_id, status);
CREATE INDEX idx_txns_party ON transactions(party_id, status);
CREATE INDEX idx_txns_khata_date ON transactions(khata_id, txn_date);
CREATE VIEW v_customer_balances AS
SELECT 
    p.id AS party_id,
    p.khata_id,
    p.name AS party_name,
    p.phone_number,
    p.address,
    p.is_finalized,
    p.status,
    COALESCE(SUM(CASE WHEN t.txn_type = 'LENA' THEN t.amount ELSE 0 END), 0) AS total_lena,
    COALESCE(SUM(CASE WHEN t.txn_type = 'DENA' THEN t.amount ELSE 0 END), 0) AS total_dena,
    COALESCE(SUM(CASE WHEN t.txn_type = 'LENA' THEN t.amount ELSE -t.amount END), 0) AS net_balance,
    MAX(t.txn_date) AS last_activity_date
FROM parties p
LEFT JOIN transactions t ON p.id = t.party_id AND t.status = 1
WHERE p.status = 1
GROUP BY p.id;
CREATE VIEW v_khata_stats AS
SELECT 
    k.id AS khata_id,
    k.name AS khata_name,
    COUNT(DISTINCT cb.party_id) AS total_parties,
    COALESCE(SUM(CASE WHEN cb.net_balance > 0 THEN cb.net_balance ELSE 0 END), 0) AS total_you_will_get,
    COALESCE(SUM(CASE WHEN cb.net_balance < 0 THEN ABS(cb.net_balance) ELSE 0 END), 0) AS total_you_will_give
FROM khatas k
LEFT JOIN v_customer_balances cb ON k.id = cb.khata_id
WHERE k.status = 1
GROUP BY k.id;
COMMIT;
