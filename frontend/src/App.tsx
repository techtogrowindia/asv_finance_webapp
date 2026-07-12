import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MembersPage } from './pages/MembersPage';
import { EnrollMemberPage } from './pages/EnrollMemberPage';
import { MemberDetailPage } from './pages/MemberDetailPage';
import { LoanApplicationPage } from './pages/LoanApplicationPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { ReportsPage } from './pages/ReportsPage';
import { LoanLedgerPage } from './pages/LoanLedgerPage';
import { KycDocumentsPage } from './pages/KycDocumentsPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { MastersPage } from './pages/admin/MastersPage';
import { CentersPage } from './pages/admin/CentersPage';
import { LoanVerificationPage } from './pages/admin/LoanVerificationPage';

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
      <ConfirmProvider>
      <Routes>
        {/* Public entry points */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage portal="employee" />} />
        <Route path="/admin" element={<LoginPage portal="admin" />} />

        {/* Employee (Field Officer) portal */}
        <Route path="/app" element={<EmployeeRoute><DashboardPage /></EmployeeRoute>} />
        <Route path="/app/clients" element={<EmployeeRoute><MembersPage /></EmployeeRoute>} />
        <Route path="/app/clients/:id" element={<EmployeeRoute><MemberDetailPage /></EmployeeRoute>} />
        <Route path="/app/clients/:id/documents" element={<EmployeeRoute><KycDocumentsPage /></EmployeeRoute>} />
        <Route path="/app/enroll" element={<EmployeeRoute><EnrollMemberPage /></EmployeeRoute>} />
        <Route path="/app/loans" element={<EmployeeRoute><LoanApplicationPage /></EmployeeRoute>} />
        <Route path="/app/collections" element={<EmployeeRoute><CollectionsPage /></EmployeeRoute>} />
        <Route path="/app/reports" element={<EmployeeRoute><ReportsPage /></EmployeeRoute>} />
        <Route path="/app/loans/:loanId/ledger" element={<EmployeeRoute><LoanLedgerPage /></EmployeeRoute>} />

        {/* Admin (BM/HO) portal */}
        <Route
          path="/admin/dashboard"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/centers"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <CentersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/masters"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <MastersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/loan-verification"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <LoanVerificationPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ConfirmProvider>
    </AuthProvider>
  );
}
