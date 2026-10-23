import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import doctorRoutes from './routes/doctors.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import queueRoutes from './routes/queue.js';
import clinicalRoutes from './routes/clinical.js';
import labRoutes from './routes/lab.js';
import pharmacyRoutes from './routes/pharmacy.js';
import inventoryRoutes from './routes/inventory.js';
import billingRoutes from './routes/billing.js';
import expenseRoutes from './routes/expenses.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import portalRoutes from './routes/portal.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/users.js';

export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: '1mb' }));
  if (!env.isProd) app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp, uptime: process.uptime() });
  });

  const api = express.Router();
  api.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }), authRoutes);
  api.use('/departments', departmentRoutes);
  api.use('/doctors', doctorRoutes);
  api.use('/patients', patientRoutes);
  api.use('/appointments', appointmentRoutes);
  api.use('/queue', queueRoutes);
  api.use('/clinical', clinicalRoutes);
  api.use('/lab', labRoutes);
  api.use('/pharmacy', pharmacyRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/billing', billingRoutes);
  api.use('/expenses', expenseRoutes);
  api.use('/reports', reportRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/portal', portalRoutes);
  api.use('/public', publicRoutes);
  api.use('/admin', adminRoutes);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
