import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';

await mongoose.connect(env.mongoUri);
console.log('MongoDB connected');

const server = createApp().listen(env.port, () => console.log(`API listening on :${env.port}`));

const shutdown = async () => {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
