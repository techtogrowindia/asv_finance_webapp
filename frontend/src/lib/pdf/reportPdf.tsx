import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { LoanLedger, LoanStatement, LoanSavingsLedger } from '../../api/loans';
import type { DemandRegisterRow } from '../../api/reportsAdmin';
import type { ClientStatement, SavingsPassbook } from '../../api/members';

// react-pdf renders real, paginated PDFs (no cropping like the browser print).
// This whole module is loaded on demand (dynamic import) so it stays out of the
// main bundle.

const inr = (v: number | string) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(v));
const d = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 8, color: '#1a2b26', fontFamily: 'Helvetica' },
  title: { fontSize: 15, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#5b6b66', marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  metaItem: { width: '25%', marginBottom: 6 },
  metaK: { color: '#5b6b66', fontSize: 7 },
  metaV: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  section: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 12, marginBottom: 4 },
  tHead: { flexDirection: 'row', backgroundColor: '#e9f1ee', borderBottomWidth: 1, borderColor: '#c9d6d1' },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e2e8e5' },
  th: { padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  td: { padding: 4 },
  totalRow: { flexDirection: 'row', backgroundColor: '#f3f7f5', borderTopWidth: 1, borderColor: '#c9d6d1' },
  foot: { position: 'absolute', bottom: 14, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', color: '#8a9995', fontSize: 7 },
});

type Col = { key: string; label: string; w: number; align?: 'right' | 'center' };

function Table({ cols, rows, total }: { cols: Col[]; rows: Record<string, string>[]; total?: Record<string, string> }) {
  return (
    <View>
      <View style={s.tHead} fixed>
        {cols.map((c) => (
          <Text key={c.key} style={[s.th, { width: `${c.w}%`, textAlign: c.align ?? 'left' }]}>{c.label}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View style={s.tRow} key={i} wrap={false}>
          {cols.map((c) => (
            <Text key={c.key} style={[s.td, { width: `${c.w}%`, textAlign: c.align ?? 'left' }]}>{r[c.key] ?? ''}</Text>
          ))}
        </View>
      ))}
      {total && (
        <View style={s.totalRow} wrap={false}>
          {cols.map((c) => (
            <Text key={c.key} style={[s.th, { width: `${c.w}%`, textAlign: c.align ?? 'left' }]}>{total[c.key] ?? ''}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Foot() {
  return (
    <View style={s.foot} fixed>
      <Text>ASV Finance</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ---- Loan ledger (loan-only) ----------------------------------------------

const LEDGER_COLS: Col[] = [
  { key: 'dueNo', label: 'Due No', w: 6, align: 'center' },
  { key: 'dueDate', label: 'Due Date', w: 11 },
  { key: 'collDate', label: 'Coll Date', w: 11 },
  { key: 'duePri', label: 'Due Pri', w: 10, align: 'right' },
  { key: 'dueInt', label: 'Due Int', w: 10, align: 'right' },
  { key: 'dueAmt', label: 'Due Amt', w: 10, align: 'right' },
  { key: 'collPri', label: 'Coll Pri', w: 10, align: 'right' },
  { key: 'collInt', label: 'Coll Int', w: 10, align: 'right' },
  { key: 'collAmt', label: 'Coll Amt', w: 11, align: 'right' },
  { key: 'dueBalance', label: 'Balance', w: 11, align: 'right' },
];

function LoanLedgerDoc({ l }: { l: LoanLedger }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>ASV FINANCE</Text>
        <Text style={s.subtitle}>Loan Ledger</Text>
        <View style={s.metaRow}>
          <Meta k="Client ID" v={l.clientDisplayId} />
          <Meta k="Client Name" v={l.clientName} />
          <Meta k="Loan Account" v={l.loanAccount} />
          <Meta k="Disbursal Date" v={d(l.disbursalDate)} />
          <Meta k="Loan Amount" v={inr(l.loanAmount)} />
          <Meta k="Interest Amount" v={inr(l.interestAmount)} />
          <Meta k="Total Amount" v={inr(l.totalAmount)} />
          <Meta k="Total Dues" v={String(l.totalDues)} />
          <Meta k="Status" v={`${l.loanType}${l.closedDate ? ` (${d(l.closedDate)})` : ''}`} />
        </View>
        <Table
          cols={LEDGER_COLS}
          rows={l.schedule.map((r) => ({
            dueNo: String(r.dueNo), dueDate: d(r.dueDate), collDate: d(r.collDate),
            duePri: inr(r.duePri), dueInt: inr(r.dueInt), dueAmt: inr(r.dueAmt),
            collPri: inr(r.collPri), collInt: inr(r.collInt), collAmt: inr(r.collAmt), dueBalance: inr(r.dueBalance),
          }))}
        />
        <Foot />
      </Page>
    </Document>
  );
}

// ---- Loan + Savings (per loan: schedule with a savings column + passbook) --

function LoanStatementDoc({ st }: { st: LoanStatement }) {
  const cols: Col[] = [
    { key: 'dueNo', label: 'Due No', w: 6, align: 'center' },
    { key: 'dueDate', label: 'Due Date', w: 10 },
    { key: 'collDate', label: 'Coll Date', w: 10 },
    { key: 'duePri', label: 'Due Pri', w: 9, align: 'right' },
    { key: 'dueInt', label: 'Due Int', w: 9, align: 'right' },
    { key: 'dueAmt', label: 'Due Amt', w: 9, align: 'right' },
    { key: 'collPri', label: 'Coll Pri', w: 9, align: 'right' },
    { key: 'collInt', label: 'Coll Int', w: 9, align: 'right' },
    { key: 'collAmt', label: 'Coll Amt', w: 10, align: 'right' },
    { key: 'savings', label: 'Savings', w: 9, align: 'right' },
    { key: 'dueBalance', label: 'Balance', w: 10, align: 'right' },
  ];
  const rows = st.schedule.map((r) => ({
    dueNo: String(r.dueNo), dueDate: d(r.dueDate), collDate: d(r.collDate),
    duePri: inr(r.duePri), dueInt: inr(r.dueInt), dueAmt: inr(r.dueAmt),
    collPri: inr(r.collPri), collInt: inr(r.collInt), collAmt: inr(r.collAmt),
    savings: inr(r.savings), dueBalance: inr(r.dueBalance),
  }));

  const savCols: Col[] = [
    { key: 'date', label: 'Date', w: 22 },
    { key: 'kind', label: 'Type', w: 18 },
    { key: 'deposit', label: 'Deposit', w: 20, align: 'right' },
    { key: 'refund', label: 'Refund', w: 20, align: 'right' },
    { key: 'balance', label: 'Balance', w: 20, align: 'right' },
  ];
  const savRows = st.savings.map((x) => ({
    date: d(x.date), kind: x.kind,
    deposit: x.deposit ? inr(x.deposit) : '—',
    refund: x.refund ? inr(x.refund) : '—',
    balance: inr(x.balance),
  }));
  const savTotal = st.savings.length
    ? {
        date: 'Total', kind: '',
        deposit: inr(st.savings.reduce((a, b) => a + b.deposit, 0)),
        refund: inr(st.savings.reduce((a, b) => a + b.refund, 0)),
        balance: inr(st.savings[st.savings.length - 1].balance),
      }
    : undefined;
  const totalCollected = st.schedule.reduce((a, r) => a + Number(r.collAmt), 0);
  const totalPending = st.schedule.reduce((a, r) => a + Number(r.dueBalance), 0);
  const duesPaid = st.schedule.filter((r) => Number(r.dueBalance) <= 0).length;
  const savingsBalance = st.savings.length ? st.savings[st.savings.length - 1].balance : 0;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>ASV FINANCE</Text>
        <Text style={s.subtitle}>Loan + Savings Statement</Text>
        <View style={s.metaRow}>
          <Meta k="Client ID" v={st.clientDisplayId} />
          <Meta k="Client Name" v={st.clientName} />
          <Meta k="Loan Account" v={st.loanAccount} />
          <Meta k="Savings A/c" v={st.savingsAccount} />
          <Meta k="Principal" v={inr(st.loanAmount)} />
          <Meta k="Total Amount" v={inr(st.totalAmount)} />
          <Meta k="Status" v={`${st.loanType}${st.closedDate ? ` (${d(st.closedDate)})` : ''}`} />
        </View>
        <View style={s.metaRow}>
          <Meta k="Collected" v={inr(totalCollected)} />
          <Meta k="Pending" v={inr(totalPending)} />
          <Meta k="Dues Paid" v={`${duesPaid} / ${st.totalDues}`} />
          <Meta k="Dues Pending" v={String(st.totalDues - duesPaid)} />
          <Meta k="Savings Balance" v={inr(savingsBalance)} />
        </View>
        <Text style={s.section}>Repayment Schedule</Text>
        <Table cols={cols} rows={rows} />
        {st.savings.length > 0 && (
          <>
            <Text style={s.section}>Savings Passbook</Text>
            <Table cols={savCols} rows={savRows} total={savTotal} />
          </>
        )}
        <Foot />
      </Page>
    </Document>
  );
}

// ---- Per-loan savings ledger ----------------------------------------------

function LoanSavingsDoc({ l }: { l: LoanSavingsLedger }) {
  const cols: Col[] = [
    { key: 'date', label: 'Date', w: 22 },
    { key: 'kind', label: 'Type', w: 18 },
    { key: 'deposit', label: 'Deposit', w: 20, align: 'right' },
    { key: 'refund', label: 'Refund', w: 20, align: 'right' },
    { key: 'balance', label: 'Balance', w: 20, align: 'right' },
  ];
  const collected = l.rows.reduce((a, r) => a + r.deposit, 0);
  const returned = l.rows.reduce((a, r) => a + r.refund, 0);
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>ASV FINANCE</Text>
        <Text style={s.subtitle}>Savings Ledger</Text>
        <View style={s.metaRow}>
          <Meta k="Client ID" v={l.displayId} />
          <Meta k="Client Name" v={l.clientName} />
          <Meta k="Savings A/c" v={l.savingsAccount} />
          <Meta k="Total Collected" v={inr(collected)} />
          <Meta k="Total Returned" v={inr(returned)} />
          <Meta k="Balance" v={inr(l.balance)} />
        </View>
        <Table
          cols={cols}
          rows={l.rows.map((r) => ({
            date: d(r.date), kind: r.kind,
            deposit: r.deposit ? inr(r.deposit) : '—',
            refund: r.refund ? inr(r.refund) : '—',
            balance: inr(r.balance),
          }))}
          total={{ date: 'Total', kind: '', deposit: inr(collected), refund: inr(returned), balance: inr(l.balance) }}
        />
        <Foot />
      </Page>
    </Document>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.metaItem}>
      <Text style={s.metaK}>{k}</Text>
      <Text style={s.metaV}>{v}</Text>
    </View>
  );
}

// ---- Demand register -------------------------------------------------------

function DemandRegisterDoc({ rows, date }: { rows: DemandRegisterRow[]; date: string }) {
  const cols: Col[] = [
    { key: 'sino', label: 'SI No', w: 4, align: 'center' },
    { key: 'branch', label: 'Branch', w: 12 },
    { key: 'center', label: 'Center Name', w: 16 },
    { key: 'phone', label: 'Phone', w: 8 },
    { key: 'clients', label: 'Clients', w: 5, align: 'center' },
    { key: 'pending', label: 'Pending', w: 6, align: 'center' },
    { key: 'avg', label: 'Avg Due', w: 5, align: 'center' },
    { key: 'meeting', label: 'Meeting', w: 8 },
    { key: 'os', label: 'Loan OS', w: 10, align: 'right' },
    { key: 'arrear', label: 'Arrear', w: 9, align: 'right' },
    { key: 'demand', label: 'Demand', w: 9, align: 'right' },
    { key: 'coll', label: 'Collected', w: 9, align: 'right' },
    { key: 'sign', label: 'CL Sign', w: 9 },
  ];
  const body = rows.map((r, i) => ({
    sino: String(i + 1),
    branch: `${r.branchCode}-${r.branchName}`,
    center: `${r.centerCode}-${r.centerName}`,
    phone: r.phone ?? '—',
    clients: String(r.clientCount),
    pending: String(r.pendingApplications),
    avg: String(r.avgDueNo),
    meeting: r.meetingTime ?? '—',
    os: inr(r.loanOS), arrear: inr(r.arrear), demand: inr(r.demand), coll: inr(r.collected), sign: '',
  }));
  const t = rows.reduce(
    (a, r) => ({ clients: a.clients + r.clientCount, pending: a.pending + r.pendingApplications, os: a.os + r.loanOS, arrear: a.arrear + r.arrear, demand: a.demand + r.demand, coll: a.coll + r.collected }),
    { clients: 0, pending: 0, os: 0, arrear: 0, demand: 0, coll: 0 },
  );
  const total = {
    sino: '', branch: '', center: 'Grand Total', phone: '', clients: String(t.clients), pending: String(t.pending),
    avg: '', meeting: '', os: inr(t.os), arrear: inr(t.arrear), demand: inr(t.demand), coll: inr(t.coll), sign: '',
  };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>ASV FINANCE</Text>
        <Text style={s.subtitle}>Centerwise Demand Register — {date}</Text>
        <Table cols={cols} rows={body} total={total} />
        <Foot />
      </Page>
    </Document>
  );
}

// ---- Savings passbook ------------------------------------------------------

const savCols: Col[] = [
  { key: 'date', label: 'Date', w: 16 },
  { key: 'loan', label: 'Loan A/c', w: 22 },
  { key: 'kind', label: 'Type', w: 14 },
  { key: 'deposit', label: 'Deposit', w: 16, align: 'right' },
  { key: 'refund', label: 'Refund', w: 16, align: 'right' },
  { key: 'balance', label: 'Balance', w: 16, align: 'right' },
];
function savingsRows(rows: SavingsPassbook['rows']) {
  return rows.map((r) => ({
    date: d(r.date), loan: r.loanAccount ?? '—', kind: r.kind,
    deposit: r.deposit ? inr(r.deposit) : '—',
    refund: r.refund ? inr(r.refund) : '—',
    balance: inr(r.balance),
  }));
}

function SavingsPassbookDoc({ pb }: { pb: SavingsPassbook }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>ASV FINANCE</Text>
        <Text style={s.subtitle}>Savings Passbook</Text>
        <View style={s.metaRow}>
          <Meta k="Client ID" v={pb.displayId} />
          <Meta k="Client Name" v={pb.clientName} />
          <Meta k="Savings A/c" v={pb.savingsAccount ?? '—'} />
          <Meta k="Balance" v={inr(pb.savingsBalance)} />
        </View>
        <Table cols={savCols} rows={savingsRows(pb.rows)} />
        <Foot />
      </Page>
    </Document>
  );
}

// ---- Combined member statement (loans + savings) ---------------------------

function ClientStatementDoc({ st }: { st: ClientStatement }) {
  const schCols: Col[] = [
    { key: 'dueNo', label: 'Due No', w: 6, align: 'center' },
    { key: 'dueDate', label: 'Due Date', w: 11 },
    { key: 'collDate', label: 'Coll Date', w: 11 },
    { key: 'duePri', label: 'Due Pri', w: 10, align: 'right' },
    { key: 'dueInt', label: 'Due Int', w: 10, align: 'right' },
    { key: 'dueAmt', label: 'Due Amt', w: 10, align: 'right' },
    { key: 'collPri', label: 'Coll Pri', w: 9, align: 'right' },
    { key: 'collInt', label: 'Coll Int', w: 9, align: 'right' },
    { key: 'collAmt', label: 'Coll Amt', w: 10, align: 'right' },
    { key: 'savings', label: 'Savings', w: 9, align: 'right' },
    { key: 'dueBalance', label: 'Balance', w: 10, align: 'right' },
  ];
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>ASV FINANCE</Text>
        <Text style={s.subtitle}>Member Statement — Loans &amp; Savings</Text>
        <View style={s.metaRow}>
          <Meta k="Client ID" v={st.displayId} />
          <Meta k="Client Name" v={st.clientName} />
          <Meta k="Savings A/c" v={st.savingsAccount ?? '—'} />
          <Meta k="Savings Balance" v={inr(st.savingsBalance)} />
        </View>

        {st.loans.map((l) => (
          <View key={l.loanAccount}>
            <Text style={s.section}>Loan {l.loanAccount} — {inr(l.loanAmount)} · {l.loanType}{l.closedDate ? ` (${d(l.closedDate)})` : ''}</Text>
            <Table
              cols={schCols}
              rows={l.schedule.map((r) => ({
                dueNo: String(r.dueNo), dueDate: d(r.dueDate), collDate: d(r.collDate),
                duePri: inr(r.duePri), dueInt: inr(r.dueInt), dueAmt: inr(r.dueAmt),
                collPri: inr(r.collPri), collInt: inr(r.collInt), collAmt: inr(r.collAmt),
                savings: inr(r.savings), dueBalance: inr(r.dueBalance),
              }))}
            />
          </View>
        ))}
        {st.loans.length === 0 && <Text style={s.section}>No loans.</Text>}

        <Text style={s.section}>Savings Passbook</Text>
        <Table cols={savCols} rows={savingsRows(st.savings)} />
        <Foot />
      </Page>
    </Document>
  );
}

// ---- download helpers ------------------------------------------------------

async function download(doc: ReactElement, filename: string) {
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const safe = (v: string) => v.replace(/\//g, '-');

export const downloadLoanLedgerPdf = (l: LoanLedger) =>
  download(<LoanLedgerDoc l={l} />, `loan-ledger-${safe(l.loanAccount)}.pdf`);

export const downloadLoanStatementPdf = (st: LoanStatement) =>
  download(<LoanStatementDoc st={st} />, `loan-savings-statement-${safe(st.loanAccount)}.pdf`);

/** Blob-only variant (no download trigger) for sharing via the Web Share API. */
export const loanStatementPdfBlob = (st: LoanStatement) => pdf(<LoanStatementDoc st={st} />).toBlob();

export const downloadLoanSavingsPdf = (l: LoanSavingsLedger) =>
  download(<LoanSavingsDoc l={l} />, `savings-ledger-${safe(l.savingsAccount)}.pdf`);

export const downloadDemandRegisterPdf = (rows: DemandRegisterRow[], date: string) =>
  download(<DemandRegisterDoc rows={rows} date={date} />, `demand-register-${date}.pdf`);

export const downloadSavingsPassbookPdf = (pb: SavingsPassbook) =>
  download(<SavingsPassbookDoc pb={pb} />, `savings-passbook-${pb.savingsAccount ?? pb.displayId}.pdf`);

export const downloadClientStatementPdf = (st: ClientStatement) =>
  download(<ClientStatementDoc st={st} />, `member-statement-${st.displayId}.pdf`);
