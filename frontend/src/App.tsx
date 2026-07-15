import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MembersPage } from './pages/MembersPage';
import { EnrollMemberPage } from './pages/EnrollMemberPage';
import { MemberDetailPage } from './pages/MemberDetailPage';
import { LoanApplicationPage } from './pages/LoanApplicationPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { ReportsPage } from './pages/ReportsPage';
import { LoanLedgerPage } from './pages/LoanLedgerPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { MastersPage } from './pages/admin/MastersPage';
import { CentersPage } from './pages/admin/CentersPage';
import { EmployeesPage } from './pages/admin/EmployeesPage';
import { LoanVerificationPage } from './pages/admin/LoanVerificationPage';
import { EodPage } from './pages/admin/EodPage';
import { ReportsPage as AdminReportsPage } from './pages/admin/ReportsPage';
import { RolesPage } from './pages/admin/RolesPage';
import { KycVerificationPage } from './pages/admin/KycVerificationPage';
import { ClientTransferPage } from './pages/admin/ClientTransferPage';
import { DemandCollectionPage } from './pages/collections/DemandCollectionPage';
import { ArrearCollectionPage } from './pages/collections/ArrearCollectionPage';
import { AdvanceCollectionPage } from './pages/collections/AdvanceCollectionPage';
import { LoanAdvancePage } from './pages/collections/LoanAdvancePage';
import { ForeclosurePage } from './pages/collections/ForeclosurePage';

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
        <Route path="/app/enroll" element={<EmployeeRoute><EnrollMemberPage /></EmployeeRoute>} />
        <Route path="/app/loans" element={<EmployeeRoute><LoanApplicationPage /></EmployeeRoute>} />
        <Route path="/app/collections" element={<EmployeeRoute><CollectionsPage /></EmployeeRoute>} />
        <Route path="/app/collections/demand" element={<EmployeeRoute><DemandCollectionPage /></EmployeeRoute>} />
        <Route path="/app/collections/arrears" element={<EmployeeRoute><ArrearCollectionPage /></EmployeeRoute>} />
        <Route path="/app/collections/pay-advance" element={<EmployeeRoute><AdvanceCollectionPage /></EmployeeRoute>} />
        <Route path="/app/collections/advance" element={<EmployeeRoute><LoanAdvancePage /></EmployeeRoute>} />
        <Route path="/app/collections/foreclose" element={<EmployeeRoute><ForeclosurePage /></EmployeeRoute>} />
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
          path="/admin/employees"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <EmployeesPage />
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
        <Route
          path="/admin/eod"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <EodPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <AdminReportsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <RolesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/kyc-verification"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <KycVerificationPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/client-transfer"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <ClientTransferPage />
            </RequireAuth>
          }
        />
        {/* Reuses the same MemberDetailPage/LoanLedgerPage as the employee portal
            (both are portal-aware — see MemberDetailPage's `base` and
            LoanLedgerPage's navigate(-1)) so BM/HO can review KYC on the same
            page; unlike the genuine admin pages these don't self-wrap in
            AdminLayout, so the route supplies it here. */}
        <Route
          path="/admin/clients/:id"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <AdminLayout><MemberDetailPage /></AdminLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/loans/:loanId/ledger"
          element={
            <RequireAuth roles={['BM', 'HO']} loginPath="/admin">
              <AdminLayout><LoanLedgerPage /></AdminLayout>
            </RequireAuth>
          }
        />
        {/* Collections — shared pages, admin portal (BM/HO). Permission-gated in nav. */}
        <Route path="/admin/collections" element={<RequireAuth roles={['BM', 'HO']} loginPath="/admin"><AdminLayout><CollectionsPage /></AdminLayout></RequireAuth>} />
        <Route path="/admin/collections/demand" element={<RequireAuth roles={['BM', 'HO']} loginPath="/admin"><AdminLayout><DemandCollectionPage /></AdminLayout></RequireAuth>} />
        <Route path="/admin/collections/arrears" element={<RequireAuth roles={['BM', 'HO']} loginPath="/admin"><AdminLayout><ArrearCollectionPage /></AdminLayout></RequireAuth>} />
        <Route path="/admin/collections/pay-advance" element={<RequireAuth roles={['BM', 'HO']} loginPath="/admin"><AdminLayout><AdvanceCollectionPage /></AdminLayout></RequireAuth>} />
        <Route path="/admin/collections/advance" element={<RequireAuth roles={['BM', 'HO']} loginPath="/admin"><AdminLayout><LoanAdvancePage /></AdminLayout></RequireAuth>} />
        <Route path="/admin/collections/foreclose" element={<RequireAuth roles={['BM', 'HO']} loginPath="/admin"><AdminLayout><ForeclosurePage /></AdminLayout></RequireAuth>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ConfirmProvider>
    </AuthProvider>
  );
}
