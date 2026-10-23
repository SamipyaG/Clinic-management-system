// Restore a backup into an EMPTY database:  node src/restore.js backups/backup-XXXX.jsonl.gz [--force]
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { restoreBackup } from './services/backup.js';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node src/restore.js <backup-file> [--force]');
  process.exit(1);
}
await mongoose.connect(env.mongoUri);
console.log(`Restoring ${file} into ${mongoose.connection.name}...`);
try {
  console.log(await restoreBackup(file, { force: flag === '--force' }));
  console.log('Done. Start the server once so Mongoose rebuilds the indexes.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
await mongoose.disconnect();
