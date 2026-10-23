/** Which roles may open each area; the API enforces the same rules, this only hides dead ends. */
export const ACCESS = {
  dashboard: ['clinic_admin', 'super_admin', 'doctor', 'receptionist', 'nurse', 'accountant', 'pharmacist', 'lab_staff'],
  patients: ['clinic_admin', 'super_admin', 'receptionist', 'doctor', 'nurse'],
  appointments: ['clinic_admin', 'super_admin', 'receptionist', 'doctor'],
  queue: ['clinic_admin', 'super_admin', 'receptionist'],
  doctor: ['doctor'],
  nurse: ['nurse', 'clinic_admin', 'super_admin'],
  lab: ['lab_staff', 'doctor', 'clinic_admin', 'super_admin'],
  pharmacy: ['pharmacist', 'nurse', 'clinic_admin', 'super_admin', 'accountant'],
  billing: ['clinic_admin', 'super_admin', 'receptionist', 'accountant'],
  reports: ['clinic_admin', 'super_admin', 'accountant'],
  admin: ['clinic_admin', 'super_admin'],
};

export const homeFor = (role) => (role === 'patient' ? '/portal' : role === 'doctor' ? '/doctor' : '/');
