import rateLimit from 'express-rate-limit';

const { ipKeyGenerator } = rateLimit;

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

export const activateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many activation attempts. Try again in 1 hour.' },
});

export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req, res) => req.tenantId || ipKeyGenerator(req, res),
  message: { error: 'Sync rate limit exceeded. Slow down.' },
});
