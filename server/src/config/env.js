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
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  backupDir: process.env.BACKUP_DIR ?? 'backups',
  backupHour: Number(process.env.BACKUP_HOUR ?? 2),
  backupKeep: Number(process.env.BACKUP_KEEP ?? 14),
  aiProvider: process.env.AI_PROVIDER ?? 'rules', // 'rules' (local, default) or 'anthropic'
  aiModel: process.env.AI_MODEL ?? 'claude-sonnet-5-5',
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};
