/**
 * Sağlık Kontrolü Route'u
 *
 * GET /api/v1/health — Sistem durumu
 */

import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStatus =
    mongoState === 1 ? 'connected' : mongoState === 2 ? 'connecting' : 'disconnected';

  res.json({
    status: 'ok',
    service: 'kalem-orchestrator',
    timestamp: new Date().toISOString(),
    dependencies: {
      mongodb: mongoStatus,
      // TODO: Stellar Horizon bağlantı kontrolü eklenecek
      stellar: 'not_checked',
    },
  });
});

export default router;
