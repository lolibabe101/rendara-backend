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
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '001_initial.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    logger.info('✅ Database migration complete');
  } catch (err) {
    logger.error('Migration error: ' + err.message);
  }
};

const PORT = env.port;
runMigrations().then(() => {
  app.listen(PORT, () => {
    logger.info(`🚀 Rendara Pro API v2.0 on port ${PORT} [${env.nodeEnv}]`);
  });
});

module.exports = app;
