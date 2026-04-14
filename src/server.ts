import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { authenticateUser } from './middleware/auth.middleware';
import tryonRoutes from './routes/tryon.routes';
import healthRoutes from './routes/health.routes';
import pluginRoutes from './routes/plugin.routes';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import tenantRoutes from './routes/tenant.routes';
import billingRoutes from './routes/billing.routes';
import leadRoutes from './routes/lead.routes';
import { DashboardController } from './controllers/dashboard.controller';
import { setupWorker } from './queues/tryonQueue';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Desativar CSP temporariamente para carregar fontes externas no Dash
}));
app.use(cors());
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.static('public'));

// Webhooks do Stripe precisam ser registrados ANTES do express.json() 
// para obter o raw body necessário para conferir a assinatura.
app.use('/v1/billing', billingRoutes);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Auth & Dashboard
app.use('/', authRoutes);
app.get('/', authenticateUser, DashboardController.getHome);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/v1/tryon', tryonRoutes);
app.use('/v1/health', healthRoutes);
app.use('/v1/plugin', pluginRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1/tenant', tenantRoutes);
app.use('/v1/leads', leadRoutes);

// Error Handling
app.use(errorHandler);

let server: any;
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  // Inicializar Worker apenas localmente
  setupWorker();

  server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Virtual Try-On Core rodando em http://0.0.0.0:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }
});

export default app;
