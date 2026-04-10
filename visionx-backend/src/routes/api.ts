import { Router } from 'express';
import chatController from '../controllers/chatController';
import moveController from '../controllers/moveController';
import clashController from '../controllers/clashController';
import ghostController from '../controllers/ghostController';

const router = Router();

router.post('/chat', chatController.handleChat);
router.get('/move-now', moveController.handleMoveNow);
router.get('/clash-oracle', clashController.handleClash);
router.get('/ghost-map', ghostController.handleGhost);

export default router;
