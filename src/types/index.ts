import { Request } from 'express';

export type TxnType = 'LENE' | 'DENE'; // LENE = You will get (Credit), DENE = You will give (Debit)

export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';

export type OtpPurpose = 'REGISTRATION' | 'LOGIN' | 'FORGOT_PASSWORD' | 'CHANGE_MOBILE';

export interface User {
  user_id: string;
  mobile_number: string;
  password_hash: string;
  mobile_verified: boolean;
  status: UserStatus;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserOtpVerification {
  otp_id: string;
  user_id: string;
  mobile_number: string;
  otp_hash: string;
  purpose: OtpPurpose;
  expires_at: string;
  verified_at?: string | null;
  attempt_count: number;
  is_verified: boolean;
  created_at: string;
}

export interface UserSession {
  session_id: string;
  user_id: string;
  refresh_token_hash: string;
  device_info?: string | null;
  ip_address?: string | null;
  expires_at: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
}

export interface Khata {
  khata_id: string;
  user_id: string;
  khata_name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  customer_id: string;
  customer_name: string;
  mobile_number?: string | null;
  address?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KhataCustomer {
  khata_customer_id: string;
  khata_id: string;
  customer_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KhataCustomerWithBalance {
  khata_customer_id: string;
  khata_id: string;
  customer_id: string;
  customer_name: string;
  mobile_number?: string | null;
  address?: string | null;
  is_active: boolean;
  total_lene: number | string;
  total_dene: number | string;
  net_balance: number | string;
  last_activity_date?: string | null;
}

export interface KhataStats {
  khata_id: string;
  user_id: string;
  khata_name: string;
  total_customers: number | string;
  total_you_will_get: number | string;
  total_you_will_give: number | string;
}

export interface Transaction {
  transaction_id: string;
  khata_customer_id: string;
  created_by: string;
  transaction_type: TxnType;
  amount: number | string;
  transaction_date: string;
  description?: string | null;
  reference_number?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionWithBalance extends Transaction {
  running_balance: number;
  customer_name?: string;
}

export interface TransactionAttachment {
  attachment_id: string;
  transaction_id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  created_at: string;
}

export interface AuditLog {
  audit_log_id: string;
  user_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  old_data?: any;
  new_data?: any;
  created_at: string;
}

export interface AuthenticatedUser {
  user_id: string;
  mobile_number: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
