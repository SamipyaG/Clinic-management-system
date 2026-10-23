// Role → permission map. Permissions are 'resource:action'; '*' grants everything.

export const ROLES = [
  'super_admin',
  'clinic_admin',
  'doctor',
  'receptionist',
  'nurse',
  'pharmacist',
  'lab_staff',
  'accountant',
  'patient',
];

const PERMISSIONS = {
  super_admin: ['*'],
  clinic_admin: ['*'],
  doctor: [
    'patient:read', 'doctor:read', 'department:read', 'appointment:read', 'appointment:update',
    'queue:read', 'queue:update', 'visit:read', 'visit:update',
    'vitals:read', 'consultation:read', 'consultation:write', 'prescription:read', 'prescription:write',
    'referral:read', 'referral:write', 'lab:read', 'lab:order', 'lab:review',
  ],
  receptionist: [
    'patient:create', 'patient:read', 'patient:update', 'doctor:read', 'department:read',
    'appointment:create', 'appointment:read', 'appointment:update',
    'queue:read', 'queue:create', 'queue:update', 'visit:read',
  ],
  nurse: [
    'patient:read', 'doctor:read', 'appointment:read', 'queue:read', 'visit:read', 'visit:update',
    'vitals:read', 'vitals:write',
  ],
  pharmacist: ['patient:read', 'department:read', 'prescription:read'],
  lab_staff: ['patient:read', 'department:read', 'lab:read', 'lab:process'],
  accountant: ['patient:read', 'appointment:read'],
  patient: ['doctor:read', 'department:read'],
};

const sets = Object.fromEntries(Object.entries(PERMISSIONS).map(([r, p]) => [r, new Set(p)]));

export const can = (role, permission) => {
  const set = sets[role];
  return !!set && (set.has('*') || set.has(permission));
};
