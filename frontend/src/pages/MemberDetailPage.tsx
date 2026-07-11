import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMember, MemberDetail } from '../api/members';

const inr = (v: string | null) =>
  v == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

export function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [m, setM] = useState<MemberDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getMember(id).then(setM).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert-error">{error}</div>;
  if (!m) return <div className="empty">Loading…</div>;

  return (
    <>
      <button className="back-link" onClick={() => navigate('/app/clients')}>
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

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">Loans</div>
        <div className="panel-body">
          <div className="empty">Loan history appears here once the Loan module is live.</div>
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
