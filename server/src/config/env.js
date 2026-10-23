import 'dotenv/config';

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing env var ${name}`);
  return value;
};

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required('MONGO_URI', isProd ? undefined : 'mongodb://127.0.0.1:27017/clinic'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  timezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};
