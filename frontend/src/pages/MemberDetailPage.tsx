import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMember, getSavingsPassbook, KycNumberInfo, MemberDetail, SavingsPassbook } from '../api/members';
import { ExistingLoan, listExistingLoans } from '../api/loans';
import { useAuth } from '../auth/AuthContext';
import { KycNumbersSection } from '../components/KycNumbersSection';
import { KycDocumentGrid } from '../components/KycDocumentGrid';

const inr = (v: string | null) =>
  v == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user?.role === 'FDO' ? '/app' : '/admin';
  const [m, setM] = useState<MemberDetail | null>(null);
  const [loans, setLoans] = useState<ExistingLoan[] | null>(null);
  const [passbook, setPassbook] = useState<SavingsPassbook | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getMember(id).then(setM).catch((e) => setError(e.message));
    listExistingLoans(id).then(setLoans).catch((e) => setError(e.message));
    getSavingsPassbook(id).then(setPassbook).catch(() => {});
  }, [id]);

  if (error) return <div className="alert-error">{error}</div>;
  if (!m) return <div className="empty">Loading…</div>;

  return (
    <>
      <button className="back-link" onClick={() => navigate(user?.role === 'FDO' ? '/app/clients' : '/admin/kyc-verification')}>
        ← Back to members
      </button>
      <div className="toolbar">
        <div>
          <h1 className="page-title">{m.name}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            <span className="mono">{m.displayId}</span> · <span className="mono">{m.clientCode}</span>{' '}
            · <span className={`badge ${m.status.toLowerCase()}`}>{m.status}</span>
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">Placement</div>
        <div className="panel-body detail-grid">
          <Item k="Center" v={`${m.centerCode} — ${m.centerName}`} />
          <Item k="Group / Member" v={`Group ${m.groupNo}, Member ${m.memberNo}`} />
          <Item k="Date of joining" v={date(m.dateOfJoining)} />
          <Item k="Requested loan product" v={m.requestedProductName ?? '—'} />
          <Item k="Requested purpose" v={m.requestedPurposeName ?? '—'} />
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">Member details</div>
        <div className="panel-body detail-grid">
          <Item k="Date of birth" v={date(m.dob)} />
          <Item k="Gender" v={m.gender ?? '—'} />
          <Item k="Mobile" v={m.mobile ?? '—'} />
          <Item k="Father's name" v={m.fatherName ?? '—'} />
          <Item k="Present address" v={m.presentAddress ?? '—'} />
          <Item k="Pincode" v={m.pincode ?? '—'} />
          <Item k="District" v={m.district ?? '—'} />
          <Item k="State" v={m.state ?? '—'} />
          <Item k="Monthly income" v={inr(m.monthlyIncome)} />
          <Item k="Monthly expense" v={inr(m.monthlyExpense)} />
        </div>
      </div>

      <KycNumbersSection
        clientId={m.id}
        party="CLIENT"
        title="Government ID proofs (KYC)"
        numbers={m.kycNumbers.filter((n) => n.party === 'CLIENT')}
        onSaved={(nums: KycNumberInfo[]) =>
          setM((prev) => (prev ? { ...prev, kycNumbers: [...prev.kycNumbers.filter((n) => n.party !== 'CLIENT'), ...nums] } : prev))
        }
      />

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">KYC document images</div>
        <div className="panel-body">
          <KycDocumentGrid clientId={m.id} party="CLIENT" />
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">Co-applicant / nominee</div>
        <div className="panel-body">
          {m.coApplicant ? (
            <div className="detail-grid">
              <Item k="Name" v={m.coApplicant.name} />
              <Item k="Relation" v={m.coApplicant.relation ?? '—'} />
              <Item k="Gender" v={m.coApplicant.gender ?? '—'} />
              <Item k="Date of birth" v={date(m.coApplicant.dob)} />
              <Item k="Mobile" v={m.coApplicant.mobile ?? '—'} />
            </div>
          ) : (
            <div className="empty">No co-applicant / nominee recorded yet.</div>
          )}
        </div>
      </div>

      {m.coApplicant && (
        <>
          <KycNumbersSection
            clientId={m.id}
            party="NOMINEE"
            title="Nominee ID proofs (KYC)"
            numbers={m.kycNumbers.filter((n) => n.party === 'NOMINEE')}
            onSaved={(nums: KycNumberInfo[]) =>
              setM((prev) => (prev ? { ...prev, kycNumbers: [...prev.kycNumbers.filter((n) => n.party !== 'NOMINEE'), ...nums] } : prev))
            }
          />
          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head">Nominee KYC document images</div>
            <div className="panel-body">
              <KycDocumentGrid clientId={m.id} party="NOMINEE" />
            </div>
          </div>
        </>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">Loans</div>
        <div className="panel-body">
          {loans && loans.length > 0 ? (
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Loan A/c</th><th>Disb. Date</th><th>Amount</th><th>Status</th>
                    <th>Pri. Balance</th><th>Int. Balance</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.id}>
                      <td className="mono">{l.loanAccount}</td>
                      <td>{date(l.disbursalDate)}</td>
                      <td>{inr(l.loanAmount)}</td>
                      <td><span className={`badge ${l.loanType === 'OPEN' ? 'active' : 'closed'}`}>{l.loanType}</span></td>
                      <td>{inr(String(l.priBalance))}</td>
                      <td>{inr(String(l.intBalance))}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`${base}/loans/${l.id}/ledger`)}>
                          View Ledger
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No loans yet for this member.</div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Savings</span>
          <span className="hint" style={{ fontWeight: 400 }}>
            A/c {m.savingsAccount ?? '—'} · Balance <strong style={{ color: 'var(--ink-900)' }}>{inr(String(m.savingsBalance))}</strong>
          </span>
        </div>
        <div className="panel-body">
          {passbook && passbook.rows.length > 0 ? (
            <div className="table-wrap" style={{ boxShadow: 'none', border: 'none' }}>
              <table className="data">
                <thead>
                  <tr><th>Date</th><th>Loan A/c</th><th>Type</th><th>Deposit</th><th>Refund</th><th>Balance</th></tr>
                </thead>
                <tbody>
                  {passbook.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{date(r.date)}</td>
                      <td className="mono">{r.loanAccount ?? '—'}</td>
                      <td><span className={`badge ${r.kind === 'DEPOSIT' ? 'active' : 'pending'}`}>{r.kind}</span></td>
                      <td>{r.deposit ? inr(String(r.deposit)) : '—'}</td>
                      <td>{r.refund ? inr(String(r.refund)) : '—'}</td>
                      <td>{inr(String(r.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No savings activity yet — the fixed savings amount is collected with each repayment.</div>
          )}
        </div>
      </div>
    </>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="detail-item">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
