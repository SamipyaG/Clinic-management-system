import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ACCESS, homeFor as home } from './access.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Appointments from './pages/Appointments.jsx';
import Queue from './pages/Queue.jsx';
import DoctorWorkspace from './pages/DoctorWorkspace.jsx';
import Nurse from './pages/Nurse.jsx';
import Lab from './pages/Lab.jsx';
import Pharmacy from './pages/Pharmacy.jsx';
import Billing from './pages/Billing.jsx';
import Reports from './pages/Reports.jsx';
import Admin from './pages/Admin.jsx';
import Portal from './pages/Portal.jsx';
import Display from './pages/Display.jsx';

function Guard({ area, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (area === 'portal' ? user.role !== 'patient' : !ACCESS[area].includes(user.role)) return <Navigate to={home(user.role)} replace />;
  return children;
}

const Page = ({ area, el }) => (
  <Guard area={area}>
    <Layout>{el}</Layout>
  </Guard>
);

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home(user.role)} replace /> : <Login />} />
      <Route path="/display/:clinicId" element={<Display />} />
      <Route path="/" element={user?.role === 'patient' ? <Navigate to="/portal" replace /> : <Page area="dashboard" el={<Dashboard />} />} />
      <Route path="/patients" element={<Page area="patients" el={<Patients />} />} />
      <Route path="/patients/:id" element={<Page area="patients" el={<PatientDetail />} />} />
      <Route path="/appointments" element={<Page area="appointments" el={<Appointments />} />} />
      <Route path="/queue" element={<Page area="queue" el={<Queue />} />} />
      <Route path="/doctor" element={<Page area="doctor" el={<DoctorWorkspace />} />} />
      <Route path="/nurse" element={<Page area="nurse" el={<Nurse />} />} />
      <Route path="/lab" element={<Page area="lab" el={<Lab />} />} />
      <Route path="/pharmacy" element={<Page area="pharmacy" el={<Pharmacy />} />} />
      <Route path="/billing" element={<Page area="billing" el={<Billing />} />} />
      <Route path="/reports" element={<Page area="reports" el={<Reports />} />} />
      <Route path="/admin" element={<Page area="admin" el={<Admin />} />} />
      <Route path="/portal" element={<Page area="portal" el={<Portal />} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
