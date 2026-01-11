import { Router } from "express";
import healthRoutes from "./routes/health";
import accountRoutes from "./routes/accounts";

const router = Router();

// Health routes (no /api prefix needed)
router.use("/api", healthRoutes);

// Account routes
router.use("/api/accounts", accountRoutes);

export default router;
