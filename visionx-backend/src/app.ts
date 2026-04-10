import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/api';
import { errorHandler } from './utils/errorHandler';
import logger from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200
  })
);

app.use('/api', apiRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

export default app;
