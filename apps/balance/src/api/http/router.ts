import { Router } from 'express';
import healthRoutes from './routes/health';
import accountRoutes from './routes/accounts';
import { authMiddleware } from './middleware/auth';

const router = Router();

// Health routes (no /api prefix needed)
router.use('/api', healthRoutes);

// Auth middleware for account routes
router.use(authMiddleware);

// Account routes
router.use('/api/accounts', accountRoutes);

export default router;
