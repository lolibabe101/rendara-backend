require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { authenticate, businessContext } = require('./middleware/auth');

// ── Route modules ─────────────────────────────────────────────────────────────
const authRoutes        = require('./modules/auth/auth.routes');
const businessRoutes    = require('./modules/businesses/business.routes');
const customerRoutes    = require('./modules/customers/customer.routes');
const productRoutes     = require('./modules/products/product.routes');
const invoiceRoutes     = require('./modules/invoices/invoice.routes');
const taxRoutes         = require('./modules/taxes/tax.routes');
const bookkeepingRoutes = require('./modules/bookkeeping/bookkeeping.routes');
const reportsRoutes     = require('./modules/reports/reports.routes');

const app = express();

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin || env.cors.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan(env.isDev ? 'dev' : 'combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: env.rateLimit.windowMs,
  max:      env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests, please try again later' },
}));

// Auth endpoints get a tighter limit
app.use('/api/auth/login',    rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 5  }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'rendara-api', timestamp: new Date().toISOString() });
});

// ── Public routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Public IRN verification endpoint (buyers scan QR → verify invoice)
app.use('/api/invoices', invoiceRoutes);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/businesses', authenticate, businessRoutes);

// Business-scoped routes: require auth + businessContext resolved from :businessId
const businessScopedRouter = express.Router({ mergeParams: true });
businessScopedRouter.use(authenticate);
businessScopedRouter.use(businessContext);

businessScopedRouter.use('/customers',   customerRoutes);
businessScopedRouter.use('/products',    productRoutes);
businessScopedRouter.use('/invoices',    invoiceRoutes);
businessScopedRouter.use('/taxes',       taxRoutes);
businessScopedRouter.use('/bookkeeping', bookkeepingRoutes);
businessScopedRouter.use('/reports',     reportsRoutes);

app.use('/api/businesses/:businessId', businessScopedRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = env.port;
app.listen(PORT, () => {
  logger.info(`🚀 Rendara API running on port ${PORT} [${env.nodeEnv}]`);
  logger.info(`📋 Health check: http://localhost:${PORT}/health`);
});

module.exports = app; // for testing
