import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import router from './router.js';
import { startScheduler } from './scheduler/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

// Serve admin page at /admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Redirect /settings to /admin
app.get('/settings', (req, res) => {
  res.redirect('/admin');
});

app.use('/api', router);

const PORT = config.port || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin`);
  startScheduler();
});
