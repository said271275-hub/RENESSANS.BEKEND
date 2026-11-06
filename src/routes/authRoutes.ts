import { Router } from 'express';
import { login, getMe, updateOwnCredentials } from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.put('/credentials', authenticateToken, requireRole(['ADMIN', 'MANAGER']), updateOwnCredentials);
router.get('/me', authenticateToken, getMe);

export default router;
