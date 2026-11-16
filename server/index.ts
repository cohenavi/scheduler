import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { authRouter } from './routes/auth.js';
import { backupRouter } from './routes/backup.js';
import { calendarRouter } from './routes/calendar.js';
import { rulesRouter } from './routes/rules.js';
import { scheduleRouter } from './routes/schedule.js';
import { templatesRouter } from './routes/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 2800);

// Trust reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto)
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', port: PORT });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/admin/analytics', analyticsRouter);
app.use('/api/admin', backupRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api', adminRouter);

// Serve built Vite frontend in production
const clientDistPath = path.resolve(__dirname, '../client');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' });
    return;
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Team Scheduler server listening on http://0.0.0.0:${PORT}`);
});
