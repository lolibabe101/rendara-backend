require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { authenticate, businessContext, requireRole } = require('./middleware/auth');
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/db');

// Route modules
const authRoutes        = require('./modules/auth/auth.routes');
const businessRoutes    = require('./modules/businesses/business.routes');
const customerRoutes    = require('./modules/customers/customer.routes');
const productRoutes     = require('./modules/products/product.routes');
const invoiceRoutes     = require('./modules/invoices/invoice.routes');
const taxRoutes         = require('./modules/taxes/tax.routes');
const bookkeepingRoutes = require('./modules/bookkeeping/bookkeeping.routes');
const reportsRoutes     = require('./modules/reports/reports.routes');
const payrollRoutes     = require('./modules/payroll/payroll.routes');
const docsRoutes        = require('./modules/documents/documents.routes');
const { whtCreditsRouter, brandingRouter, calendarRouter, recurringRouter, subscriptionsRouter } = require('./modules/pro/pro.routes');

const app = express();

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || env.cors.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isDev ? 'dev' : 'combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));
app.use('/api/', rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'rendara-pro-api', version: '2.0', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/subscriptions', subscriptionsRouter);

// Protected business-scoped routes
const bizRouter = express.Router({ mergeParams: true });
bizRouter.use(authenticate);
bizRouter.use(businessContext);
bizRouter.use('/customers',    customerRoutes);
bizRouter.use('/products',     productRoutes);
bizRouter.use('/invoices',     invoiceRoutes);
bizRouter.use('/taxes',        taxRoutes);
bizRouter.use('/bookkeeping',  bookkeepingRoutes);
bizRouter.use('/reports',      reportsRoutes);
bizRouter.use('/payroll',      payrollRoutes);
bizRouter.use('/documents',    docsRoutes);
bizRouter.use('/wht-credits',  whtCreditsRouter);
bizRouter.use('/branding',     brandingRouter);
bizRouter.use('/calendar',     calendarRouter);
bizRouter.use('/recurring',    recurringRouter);

app.use('/api/businesses', authenticate, businessRoutes);
app.use('/api/businesses/:businessId', bizRouter);

app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` }));
app.use(errorHandler);

// Auto-migrate then start
const runMigrations = async () => {
  const migrations = ['001_initial.sql', '002_pro.sql'];
  for (const file of migrations) {
    try {
      const sqlPath = path.join(__dirname, '..', 'migrations', file);
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await pool.query(sql);
      logger.info(`✅ Migration ${file} complete`);
    } catch (err) {
      logger.error(`Migration ${file} error: ${err.message}`);
    }
  }
};

const PORT = env.port;
runMigrations().then(() => {
  app.listen(PORT, () => {
    logger.info(`🚀 Rendara Pro API v2.0 on port ${PORT} [${env.nodeEnv}]`);
  });
});

module.exports = app;

// ── PENALTY CALCULATOR (public utility) ──────────────────────
const penaltyRouter = require('express').Router();
penaltyRouter.post('/calculate', (req, res) => {
  const { taxType, principal, dueDate, paymentDate } = req.body;
  if (!principal || !dueDate) {
    return res.status(400).json({ success: false, message: 'principal and dueDate required' });
  }
  const due = new Date(dueDate);
  const paid = paymentDate ? new Date(paymentDate) : new Date();
  const daysLate = Math.max(0, Math.ceil((paid - due) / (1000 * 60 * 60 * 24)));
  
  // FIRS penalty: 10% of tax + 21% per annum interest (CITA S.85, FITA S.68)
  const penaltyRate = 0.10;
  const interestRate = 0.21 / 365;
  const penaltyAmount = daysLate > 0 ? principal * penaltyRate : 0;
  const interestAmount = daysLate > 0 ? principal * interestRate * daysLate : 0;
  const totalDue = parseFloat(principal) + penaltyAmount + interestAmount;

  res.json({
    success: true,
    data: {
      taxType, principal: parseFloat(principal),
      dueDate, paymentDate: paid.toISOString().split('T')[0],
      daysLate, penaltyRate: '10%', interestRate: '21% per annum',
      penaltyAmount: +penaltyAmount.toFixed(2),
      interestAmount: +interestAmount.toFixed(2),
      totalDue: +totalDue.toFixed(2),
      breakdown: `Principal ₦${principal} + Penalty ₦${penaltyAmount.toFixed(2)} + Interest ₦${interestAmount.toFixed(2)} = ₦${totalDue.toFixed(2)}`
    }
  });
});
app.use('/api/penalty', penaltyRouter);
