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
    'dashboard:read',
    'patient:read', 'doctor:read', 'department:read', 'appointment:read', 'appointment:update',
    'queue:read', 'queue:update', 'visit:read', 'visit:update',
    'vitals:read', 'consultation:read', 'consultation:write', 'prescription:read', 'prescription:write',
    'referral:read', 'referral:write', 'lab:read', 'lab:order', 'lab:review', 'pharmacy:read',
    'document:read', 'document:write', 'ai:use',
  ],
  receptionist: [
    'dashboard:read',
    'billing:read', 'billing:write', 'payment:create', 'clinic:read', 'document:read', 'document:write',
    'patient:create', 'patient:read', 'patient:update', 'doctor:read', 'department:read',
    'appointment:create', 'appointment:read', 'appointment:update',
    'queue:read', 'queue:create', 'queue:update', 'visit:read',
  ],
  nurse: [
    'dashboard:read',
    'patient:read', 'doctor:read', 'appointment:read', 'queue:read', 'visit:read', 'visit:update',
    'vitals:read', 'vitals:write', 'inventory:read', 'inventory:use', 'document:read', 'ai:use',
  ],
  pharmacist: [
    'dashboard:read',
    'patient:read', 'department:read', 'prescription:read',
    'pharmacy:read', 'pharmacy:manage', 'pharmacy:dispense', 'inventory:read', 'inventory:manage',
  ],
  lab_staff: ['dashboard:read', 'patient:read', 'department:read', 'lab:read', 'lab:process', 'document:read', 'document:write'],
  accountant: [
    'dashboard:read', 'report:read',
    'patient:read', 'appointment:read',
    'billing:read', 'billing:write', 'billing:discount', 'payment:create', 'payment:refund',
    'expense:read', 'expense:write', 'pharmacy:read', 'inventory:read',
  ],
  patient: ['doctor:read', 'department:read'],
};

const sets = Object.fromEntries(Object.entries(PERMISSIONS).map(([r, p]) => [r, new Set(p)]));

export const can = (role, permission) => {
  const set = sets[role];
  return !!set && (set.has('*') || set.has(permission));
};
