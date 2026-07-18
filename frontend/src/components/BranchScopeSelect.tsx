import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BranchLite, listAdminBranches } from '../api/employeesAdmin';

/** Branch-narrowing dropdown for HO (Business Admin) screens that list
 *  branch-scoped data (centers, collections, KYC queue, client transfer…).
 *  BM/FDO don't need it — their visibility is already fixed server-side
 *  (centerScope()) — so it renders nothing for them. */
export function BranchScopeSelect({ value, onChange }: { value: string; onChange: (branchId: string) => void }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<BranchLite[]>([]);

  useEffect(() => {
    if (user?.role !== 'HO') return;
    listAdminBranches().then(setBranches).catch(() => {});
  }, [user?.role]);

  if (user?.role !== 'HO') return null;

  return (
    <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
      <label>Branch</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All branches</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
      </select>
    </div>
  );
}
