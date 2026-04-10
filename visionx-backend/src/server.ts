import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { initRealtime } from './utils/realtime';

const port = process.env.PORT || 4000;
const server = http.createServer(app);

initRealtime(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`VisionX backend running on port ${port}`);
});
