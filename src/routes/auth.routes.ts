import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Telas (Browser)
router.get('/login', AuthController.getLogin);
router.get('/register', AuthController.getRegister);
router.get('/logout', AuthController.logout);
router.get('/reset-password', AuthController.getResetPassword);

// API (JWT Interno)
router.post('/login', AuthController.loginApi);
router.post('/register', AuthController.registerApi);
router.post('/change-password', authenticateUser, AuthController.changePassword);

export default router;
