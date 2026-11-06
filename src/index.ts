import express from 'express';
import cors from 'cors';
import { config } from './config';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import managerRoutes from './routes/managerRoutes';
import teacherRoutes from './routes/teacherRoutes';

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    try {
      if (config.frontendOrigins.has(new URL(origin).origin)) {
        callback(null, true);
        return;
      }
    } catch {
      callback(new Error('Invalid request origin.'));
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json());

// Health check endpoints
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'RENESSANS Backend tizimi ishlamoqda' });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Renesens API ishlayapti' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/teacher', teacherRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof Error && err.message.startsWith('CORS origin not allowed:')) {
    return res.status(403).json({ message: 'Bu manbadan API ga kirishga ruxsat yo\'q.' });
  }
  console.error('Kutilmagan xatolik:', err);
  res.status(500).json({ message: 'Serverda ichki xatolik yuz berdi.', error: err.message });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[RENESSANS Backend] Server 0.0.0.0:${config.port} portida ishga tushdi.`);
});

export default app;
