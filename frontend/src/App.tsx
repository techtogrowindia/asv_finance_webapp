import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ComingSoon } from './pages/ComingSoon';
import { AdminDashboard } from './pages/admin/AdminDashboard';

/** Wraps a page in the employee shell + auth guard (FDO only). */
function EmployeeRoute({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['FDO']} loginPath="/login">
      <AppLayout>{children}</AppLayout>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public entry points */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage portal="employee" />} />
        <Route path="/admin" element={<LoginPage portal="admin" />} />

        {/* Employee (Field Officer) portal */}
        <Route path="/app" element={<EmployeeRoute><DashboardPage /></EmployeeRoute>} />
        <Route path="/app/clients" element={<EmployeeRoute><ComingSoon title="Members" /></EmployeeRoute>} />
        <Route path="/app/enroll" element={<EmployeeRoute><ComingSoon title="Enroll Member" /></EmployeeRoute>} />
        <Route path="/app/loans" element={<EmployeeRoute><ComingSoon title="Loans" /></EmployeeRoute>} />
        <Route path="/app/collections" element={<EmployeeRoute><ComingSoon title="Collections" /></EmployeeRoute>} />
        <Route path="/app/reports" element={<EmployeeRoute><ComingSoon title="Reports" /></EmployeeRoute>} />

        {/* Admin (BM/HO) portal */}
        <Route
          path="/admin/dashboard"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <div className="shell" style={{ gridTemplateColumns: '1fr' }}>
                <AdminDashboard />
              </div>
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
