import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { listBackups } from './backup.js';

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

const mb = (n) => Math.round((n / 1024 / 1024) * 10) / 10;

/** Operational snapshot for the admin screen. `status`: ok | degraded | down. */
export const systemHealth = async () => {
  const started = Date.now();
  let dbUp = false;
  try {
    await mongoose.connection.db.admin().ping();
    dbUp = true;
  } catch {
    /* reported below */
  }
  const pingMs = Date.now() - started;

  const [pending, failed, backups] = dbUp
    ? await Promise.all([
        Notification.countDocuments({ status: 'pending', sendAt: { $lt: new Date(Date.now() - 10 * 60_000) } }),
        Notification.countDocuments({ status: 'failed' }),
        listBackups(),
      ])
    : [0, 0, []];

  const lastBackup = backups[0]?.createdAt ?? null;
  const backupAgeHours = lastBackup ? Math.round((Date.now() - lastBackup) / 360_000) / 10 : null;
  const mem = process.memoryUsage();
  const lagMs = Math.round((loop.mean / 1e6) * 10) / 10;
  loop.reset();

  const issues = [];
  if (!dbUp) issues.push('Database unreachable');
  if (pending > 0) issues.push(`${pending} notification(s) overdue by more than 10 minutes`);
  if (failed > 0) issues.push(`${failed} notification(s) failed permanently`);
  if (backupAgeHours === null) issues.push('No backup has been taken yet');
  else if (backupAgeHours > 48) issues.push(`Last backup is ${backupAgeHours} hours old`);
  if (lagMs > 200) issues.push(`Event loop lag is ${lagMs} ms`);

  return {
    status: !dbUp ? 'down' : issues.length ? 'degraded' : 'ok',
    issues,
    checkedAt: new Date(),
    database: { up: dbUp, pingMs },
    process: { uptimeSeconds: Math.round(process.uptime()), rssMB: mb(mem.rss), heapUsedMB: mb(mem.heapUsed), eventLoopLagMs: lagMs, node: process.version },
    host: { load1m: Math.round(os.loadavg()[0] * 100) / 100, freeMemMB: mb(os.freemem()), totalMemMB: mb(os.totalmem()) },
    notifications: { overduePending: pending, failed },
    backups: { count: backups.length, lastBackupAt: lastBackup, ageHours: backupAgeHours },
  };
};
