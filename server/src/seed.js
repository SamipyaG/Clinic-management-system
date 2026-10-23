// Creates a first clinic and admin so you can log in. Usage: ADMIN_PASSWORD=... npm run seed
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { Clinic } from './models/Clinic.js';
import { User } from './models/User.js';
import { Organization } from './models/Organization.js';

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
  const organization = await Organization.create({ name: 'My Clinic Group' });
  const clinic = await Clinic.create({ name: 'Main Clinic', organization: organization.id });
  await User.create({
    clinic: clinic.id,
    organization: organization.id,
    name: 'Clinic Admin',
    email,
    role: 'clinic_admin',
    passwordHash: await User.hashPassword(password),
  });
  console.log(`Created clinic "${clinic.name}" and admin ${email}`);
}

// Optional platform operator who can manage every organization and switch into any clinic.
const superEmail = process.env.SUPER_ADMIN_EMAIL;
const superPassword = process.env.SUPER_ADMIN_PASSWORD;
if (superEmail && superPassword?.length >= 8 && !(await User.exists({ email: superEmail }))) {
  const home = await Clinic.findOne().sort('createdAt');
  await User.create({ clinic: home.id, name: 'Platform Admin', email: superEmail, role: 'super_admin', passwordHash: await User.hashPassword(superPassword) });
  console.log(`Created platform admin ${superEmail}`);
}
await mongoose.disconnect();
