// Creates a first clinic and admin so you can log in. Usage: ADMIN_PASSWORD=... npm run seed
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { Clinic } from './models/Clinic.js';
import { User } from './models/User.js';

const email = process.env.ADMIN_EMAIL ?? 'admin@clinic.local';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 8) {
  console.error('Set ADMIN_PASSWORD (min 8 chars) to seed the admin account.');
  process.exit(1);
}

await mongoose.connect(env.mongoUri);

if (await User.exists({ email })) {
  console.log(`Admin ${email} already exists, nothing to do.`);
} else {
  const clinic = await Clinic.create({ name: 'Main Clinic' });
  await User.create({
    clinic: clinic.id,
    name: 'Clinic Admin',
    email,
    role: 'clinic_admin',
    passwordHash: await User.hashPassword(password),
  });
  console.log(`Created clinic "${clinic.name}" and admin ${email}`);
}
await mongoose.disconnect();
