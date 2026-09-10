import { Router } from 'express';
import { authHandler } from '../handlers/index.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', authHandler.login);
authRouter.post('/register', authHandler.register);
authRouter.post('/refresh-token', authHandler.refreshToken);
authRouter.post('/logout', authHandler.logout);

// Forgot & Reset Password routes
authRouter.post('/forgot-password', authHandler.forgotPassword);
authRouter.post('/forgot-password/verify-otp', authHandler.verifyResetOtp);
authRouter.post('/reset-password', authHandler.resetPassword);

// OTP Verification routes
authRouter.post('/send-otp', authHandler.sendOtp);
authRouter.post('/verify-otp', authHandler.verifyOtp);

// Profile
authRouter.get('/me', authenticate, authHandler.getMe);

