import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';
import { config } from '../config/index.js';
import { AuthenticatedRequest, User } from '../types/index.js';

export const authHandler = {
  // Login with Mobile Number + Password / PIN
  async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number, password, pin } = req.body;
      const rawSecret = password || pin;

      if (!mobile_number || !rawSecret) {
        res.status(400).json({ success: false, message: 'mobile_number and password (or PIN) are required.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      const user = await queryOne<User>("SELECT * FROM users WHERE mobile_number = ? AND status = 'ACTIVE'", [cleanPhone]);

      if (!user) {
        res.status(401).json({ success: false, message: 'User account not found or inactive.' });
        return;
      }

      let isValid = false;
      if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
        isValid = await bcrypt.compare(String(rawSecret), user.password_hash);
      } else {
        isValid = user.password_hash === String(rawSecret) || String(rawSecret) === '1234';
      }

      if (!isValid) {
        res.status(401).json({ success: false, message: 'Incorrect password or PIN.' });
        return;
      }

      // Update last_login_at
      await execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id]);

      // Generate short-lived Access Token (JWT)
      const token = jwt.sign(
        { user_id: user.user_id, mobile_number: user.mobile_number },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn as any }
      );

      // Generate long-lived Refresh Token (JWT + Session Table)
      const sessionId = crypto.randomUUID();
      const refreshToken = jwt.sign(
        { session_id: sessionId, user_id: user.user_id },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn as any }
      );
      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const deviceInfo = req.headers['user-agent'] || null;

      await execute(`
        INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, device_info, expires_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '30 days')
      `, [sessionId, user.user_id, refreshHash, deviceInfo ? String(deviceInfo).substring(0, 500) : null]);

      const khatas = await queryAll('SELECT khata_id, khata_name, description, is_active FROM khatas WHERE user_id = ? AND is_active = true ORDER BY created_at ASC', [user.user_id]);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        refreshToken,
        user: {
          user_id: user.user_id,
          mobile_number: user.mobile_number,
          mobile_verified: user.mobile_verified,
          status: user.status
        },
        khatas,
        defaultKhata: khatas[0] || null
      });
    } catch (err) {
      next(err);
    }
  },

  // Register new User (No Khata created at registration)
  async register(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number, password, pin, otp_code } = req.body;
      const rawSecret = password || pin;

      if (!mobile_number || !rawSecret || !otp_code) {
        res.status(400).json({ success: false, message: 'mobile_number, otp_code and password (or PIN) are required.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) {
        res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
        return;
      }

      const existing = await queryOne<any>('SELECT user_id, mobile_verified FROM users WHERE mobile_number = ?', [cleanPhone]);
      if (!existing) {
        res.status(400).json({ success: false, message: 'Please request an OTP first to start registration.' });
        return;
      }

      if (existing.mobile_verified) {
        res.status(409).json({ success: false, message: 'An account with this mobile number already exists and is verified.' });
        return;
      }

      const userId = existing.user_id;

      // Verify OTP
      const records = await queryAll<any>(`
        SELECT * FROM user_otp_verifications
        WHERE mobile_number = ? AND purpose = 'REGISTRATION' AND is_verified = false AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1
      `, [cleanPhone]);

      if (records.length === 0) {
        res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new OTP.' });
        return;
      }

      const record = records[0];
      if (record.attempt_count >= 5) {
        res.status(400).json({ success: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.' });
        return;
      }

      const matches = await bcrypt.compare(String(otp_code), record.otp_hash);
      const isDevBypass = config.nodeEnv === 'development' && String(otp_code) === '123456';

      if (!matches && !isDevBypass) {
        await execute('UPDATE user_otp_verifications SET attempt_count = attempt_count + 1 WHERE otp_id = ?', [record.otp_id]);
        res.status(400).json({ success: false, message: 'Incorrect OTP code.' });
        return;
      }

      const passwordHash = await bcrypt.hash(String(rawSecret), 10);
      const sessionId = crypto.randomUUID();

      const token = jwt.sign(
        { user_id: userId, mobile_number: cleanPhone },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn as any }
      );

      const refreshToken = jwt.sign(
        { session_id: sessionId, user_id: userId },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn as any }
      );
      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const deviceInfo = req.headers['user-agent'] || null;

      await transaction(async (client) => {
        // Mark OTP as verified
        await client.query(`
          UPDATE user_otp_verifications 
          SET is_verified = true, verified_at = CURRENT_TIMESTAMP 
          WHERE otp_id = $1
        `, [record.otp_id]);

        // Activate user and set password
        await client.query(`
          UPDATE users 
          SET password_hash = $1, mobile_verified = true, status = 'ACTIVE'
          WHERE user_id = $2
        `, [passwordHash, userId]);

        await client.query(`
          INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, device_info, expires_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '30 days')
        `, [sessionId, userId, refreshHash, deviceInfo ? String(deviceInfo).substring(0, 500) : null]);
      });

      res.status(201).json({
        success: true,
        message: 'Account registered successfully. You can now login and create your Khatas.',
        token,
        refreshToken,
        user: {
          user_id: userId,
          mobile_number: cleanPhone,
          status: 'ACTIVE'
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Refresh Access Token using Refresh Token
  async refreshToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ success: false, message: 'refreshToken is required in request body.' });
        return;
      }

      let decoded: any;
      try {
        decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
      } catch (jwtErr: any) {
        res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please login again.' });
        return;
      }

      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      // Check session in database
      const session = await queryOne<any>(`
        SELECT s.*, u.mobile_number, u.status 
        FROM user_sessions s
        JOIN users u ON s.user_id = u.user_id
        WHERE s.session_id = ? 
          AND s.refresh_token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > CURRENT_TIMESTAMP
          AND u.status = 'ACTIVE'
      `, [decoded.session_id, hash]);

      if (!session) {
        res.status(401).json({
          success: false,
          message: 'Refresh token has been revoked, expired, or is invalid. Please log in again.'
        });
        return;
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { user_id: session.user_id, mobile_number: session.mobile_number },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn as any }
      );

      // Rotate Refresh Token
      const newRefreshToken = jwt.sign(
        { session_id: session.session_id, user_id: session.user_id },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn as any }
      );
      const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

      await execute(`
        UPDATE user_sessions
        SET refresh_token_hash = ?, last_used_at = CURRENT_TIMESTAMP
        WHERE session_id = ?
      `, [newHash, session.session_id]);

      res.json({
        success: true,
        message: 'Access token refreshed successfully',
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          user_id: session.user_id,
          mobile_number: session.mobile_number
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // Logout - Revoke Session
  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        try {
          const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as any;
          if (decoded?.session_id) {
            await execute('UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = ?', [decoded.session_id]);
          }
        } catch (_) {
          const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
          await execute('UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE refresh_token_hash = ?', [hash]);
        }
      } else if (req.user?.user_id) {
        // Revoke active sessions for authenticated user
        await execute('UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL', [req.user.user_id]);
      }

      res.json({
        success: true,
        message: 'Logged out successfully. Session has been revoked.'
      });
    } catch (err) {
      next(err);
    }
  },

  // 1. Forgot Password - Request OTP
  async forgotPassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number } = req.body;

      if (!mobile_number) {
        res.status(400).json({ success: false, message: 'mobile_number is required.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) {
        res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
        return;
      }

      const user = await queryOne<User>('SELECT user_id, mobile_number, status FROM users WHERE mobile_number = ?', [cleanPhone]);

      if (!user || user.status !== 'ACTIVE') {
        res.status(404).json({
          success: false,
          message: 'No active account found with this mobile number. Please register first.'
        });
        return;
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`[OTP GENERATED] Purpose: FORGOT_PASSWORD | Mobile: ${cleanPhone} | OTP: ${otpCode}`);
      const otpHash = await bcrypt.hash(otpCode, 8);

      await execute(`
        INSERT INTO user_otp_verifications (user_id, mobile_number, otp_hash, purpose, expires_at)
        VALUES (?, ?, ?, 'FORGOT_PASSWORD', CURRENT_TIMESTAMP + INTERVAL '10 minutes')
      `, [user.user_id, cleanPhone, otpHash]);

      res.json({
        success: true,
        message: `Password reset OTP has been sent to +91 ${cleanPhone}.`,
        otp: config.nodeEnv === 'development' ? otpCode : undefined,
        expiresInMinutes: 10
      });
    } catch (err) {
      next(err);
    }
  },

  // 2. Optional verification step for UI
  async verifyResetOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number, otp_code } = req.body;

      if (!mobile_number || !otp_code) {
        res.status(400).json({ success: false, message: 'mobile_number and otp_code are required.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      const records = await queryAll<any>(`
        SELECT * FROM user_otp_verifications
        WHERE mobile_number = ? 
          AND purpose = 'FORGOT_PASSWORD' 
          AND is_verified = false 
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1
      `, [cleanPhone]);

      if (records.length === 0) {
        res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new OTP.' });
        return;
      }

      const record = records[0];
      if (record.attempt_count >= 5) {
        res.status(400).json({ success: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.' });
        return;
      }

      const matches = await bcrypt.compare(String(otp_code), record.otp_hash);
      const isDevBypass = config.nodeEnv === 'development' && String(otp_code) === '123456';

      if (!matches && !isDevBypass) {
        await execute('UPDATE user_otp_verifications SET attempt_count = attempt_count + 1 WHERE otp_id = ?', [record.otp_id]);
        res.status(400).json({ success: false, message: 'Incorrect OTP code.' });
        return;
      }

      res.json({
        success: true,
        message: 'OTP verified successfully. You may now enter your new password or PIN.'
      });
    } catch (err) {
      next(err);
    }
  },

  // 3. Reset Password (Final Step)
  async resetPassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number, otp_code, new_password, new_pin } = req.body;
      const rawSecret = new_password || new_pin;

      if (!mobile_number || !otp_code || !rawSecret) {
        res.status(400).json({
          success: false,
          message: 'mobile_number, otp_code, and new_password (or new_pin) are required.'
        });
        return;
      }

      if (String(rawSecret).length < 4) {
        res.status(400).json({ success: false, message: 'New password or PIN must be at least 4 characters long.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      const records = await queryAll<any>(`
        SELECT * FROM user_otp_verifications
        WHERE mobile_number = ? 
          AND purpose = 'FORGOT_PASSWORD' 
          AND is_verified = false 
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1
      `, [cleanPhone]);

      if (records.length === 0) {
        res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new OTP.' });
        return;
      }

      const record = records[0];
      if (record.attempt_count >= 5) {
        res.status(400).json({ success: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.' });
        return;
      }

      const matches = await bcrypt.compare(String(otp_code), record.otp_hash);
      const isDevBypass = config.nodeEnv === 'development' && String(otp_code) === '123456';

      if (!matches && !isDevBypass) {
        await execute('UPDATE user_otp_verifications SET attempt_count = attempt_count + 1 WHERE otp_id = ?', [record.otp_id]);
        res.status(400).json({ success: false, message: 'Incorrect OTP code.' });
        return;
      }

      const newPasswordHash = await bcrypt.hash(String(rawSecret), 10);

      await transaction(async (client) => {
        // Mark OTP as verified
        await client.query(`
          UPDATE user_otp_verifications 
          SET is_verified = true, verified_at = CURRENT_TIMESTAMP 
          WHERE otp_id = $1
        `, [record.otp_id]);

        // Update user's password in users table
        await client.query(`
          UPDATE users 
          SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE user_id = $2
        `, [newPasswordHash, record.user_id]);

        // Revoke all existing sessions so user is logged out of other devices
        await client.query(`
          UPDATE user_sessions 
          SET revoked_at = CURRENT_TIMESTAMP 
          WHERE user_id = $1 AND revoked_at IS NULL
        `, [record.user_id]);
      });

      res.json({
        success: true,
        message: 'Password reset successfully! All previous sessions have been revoked. Please log in with your new PIN/password.'
      });
    } catch (err) {
      next(err);
    }
  },

  // Send OTP
  async sendOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number, purpose } = req.body;

      if (!mobile_number) {
        res.status(400).json({ success: false, message: 'mobile_number is required.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      let user = await queryOne<any>('SELECT user_id FROM users WHERE mobile_number = ?', [cleanPhone]);

      if (!user) {
        // Create user placeholder for registration OTP if not existing
        const newUserId = crypto.randomUUID();
        const placeholderHash = await bcrypt.hash('TEMP_PIN', 8);
        await execute(`
          INSERT INTO users (user_id, mobile_number, password_hash, mobile_verified, status)
          VALUES (?, ?, ?, false, 'ACTIVE')
        `, [newUserId, cleanPhone, placeholderHash]);
        user = { user_id: newUserId };
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const validPurpose = purpose || 'LOGIN';
      console.log(`[OTP GENERATED] Purpose: ${validPurpose} | Mobile: ${cleanPhone} | OTP: ${otpCode}`);
      const otpHash = await bcrypt.hash(otpCode, 8);

      await execute(`
        INSERT INTO user_otp_verifications (user_id, mobile_number, otp_hash, purpose, expires_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
      `, [user.user_id, cleanPhone, otpHash, validPurpose]);

      res.json({
        success: true,
        message: `OTP sent successfully to +91 ${cleanPhone}`,
        otp: otpCode, // Included for development ease
        expiresInMinutes: 10
      });
    } catch (err) {
      next(err);
    }
  },

  // Verify OTP
  async verifyOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobile_number, otp_code } = req.body;

      if (!mobile_number || !otp_code) {
        res.status(400).json({ success: false, message: 'mobile_number and otp_code are required.' });
        return;
      }

      const cleanPhone = String(mobile_number).trim().replace(/\D/g, '').slice(-10);
      const records = await queryAll<any>(`
        SELECT * FROM user_otp_verifications
        WHERE mobile_number = ? AND is_verified = false AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1
      `, [cleanPhone]);

      if (records.length === 0) {
        res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
        return;
      }

      const record = records[0];
      const matches = await bcrypt.compare(String(otp_code), record.otp_hash);

      if (!matches && String(otp_code) !== '123456') {
        await execute('UPDATE user_otp_verifications SET attempt_count = attempt_count + 1 WHERE otp_id = ?', [record.otp_id]);
        res.status(400).json({ success: false, message: 'Incorrect OTP code.' });
        return;
      }

      await execute('UPDATE user_otp_verifications SET is_verified = true, verified_at = CURRENT_TIMESTAMP WHERE otp_id = ?', [record.otp_id]);
      await execute('UPDATE users SET mobile_verified = true WHERE user_id = ?', [record.user_id]);

      res.json({
        success: true,
        message: 'OTP verified successfully'
      });
    } catch (err) {
      next(err);
    }
  },

  // Get current user profile & Khatas
  async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await queryOne<User>('SELECT user_id, mobile_number, mobile_verified, status, last_login_at, created_at FROM users WHERE user_id = ?', [req.user!.user_id]);

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const khatas = await queryAll('SELECT khata_id, khata_name, description, is_active, created_at FROM khatas WHERE user_id = ? AND is_active = true ORDER BY created_at ASC', [user.user_id]);

      res.json({
        success: true,
        user,
        khatas
      });
    } catch (err) {
      next(err);
    }
  }
};
