import http from 'node:http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initRealtime, closeRealtime } from './services/realtime.js';
import { startJobs } from './jobs.js';

await mongoose.connect(env.mongoUri);
console.log('MongoDB connected');

const server = http.createServer(createApp());
initRealtime(server);
const stopJobs = startJobs();
server.listen(env.port, () => console.log(`API listening on :${env.port}`));

const shutdown = async () => {
  stopJobs();
  closeRealtime();
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
