import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));
const time = (iso) => new Date(iso).toLocaleTimeString();

// Human-readable item (e.g. a security-group rule or an IAM action)
const itemLabel = (it) =>
  it && typeof it === 'object' && 'cidr' in it
    ? `${it.protocol}/${it.port === -1 ? 'all' : it.port} from ${it.cidr}`
    : typeof it === 'string' ? it : JSON.stringify(it);

/** For array-valued fields show only what changed: + added live, − missing live. */
function ArrayDiff({ declared, live }) {
  const dKeys = new Map((declared || []).map((i) => [JSON.stringify(i), i]));
  const lKeys = new Map((live || []).map((i) => [JSON.stringify(i), i]));
  const added = [...lKeys].filter(([k]) => !dKeys.has(k)).map(([, v]) => v);
  const removed = [...dKeys].filter(([k]) => !lKeys.has(k)).map(([, v]) => v);
  return (
    <div className="arrdiff">
      {added.map((i, n) => <div key={`a${n}`} className="diff-add"><b>+</b> {itemLabel(i)}</div>)}
      {removed.map((i, n) => <div key={`r${n}`} className="diff-rem"><b>−</b> {itemLabel(i)}</div>)}
      {!added.length && !removed.length && <span className="muted">order changed</span>}
    </div>
  );
}

function RiskBadge({ level, score }) {
  return (
    <span className={`badge badge-${level}`} title={`Risk score ${score}/100`}>
      {level}
      <small>{score}</small>
    </span>
  );
}

function SummaryCards({ summary, filter, onFilter }) {
  return (
    <div className="cards">
      {LEVELS.map((lvl) => (
        <button
          key={lvl}
          className={`card card-${lvl} ${filter === lvl ? 'active' : ''}`}
          onClick={() => onFilter(filter === lvl ? null : lvl)}
        >
          <span className="card-count">{summary?.byLevel?.[lvl] ?? 0}</span>
          <span className="card-label">{lvl}</span>
        </button>
      ))}
    </div>
  );
}

function DriftRow({ d, approver, busyId, onRemediate }) {
  const done = d.status === 'REMEDIATED';
  return (
    <tr className={done ? 'row-done' : ''}>
      <td><RiskBadge level={d.riskLevel} score={d.riskScore} /></td>
      <td>
        <div className="mono strong">{d.resourceKey}</div>
        <div className="muted">{d.resourceType}</div>
      </td>
      <td>
        <span className="mono">{d.field}</span>
        <div className="muted">{d.changeType}</div>
      </td>
      <td className="change">
        {d.changeType === 'MISSING' || d.changeType === 'UNMANAGED' ? (
          <span className="muted">
            {d.changeType === 'MISSING' ? 'Declared in Terraform, absent live' : 'Live, but not in Terraform'}
          </span>
        ) : Array.isArray(d.declaredValue) || Array.isArray(d.liveValue) ? (
          <ArrayDiff declared={d.declaredValue} live={d.liveValue} />
        ) : (
          <>
            <code className="declared" title="Declared (Terraform)">{fmt(d.declaredValue)}</code>
            <span className="arrow">→</span>
            <code className="live" title="Live (cloud)">{fmt(d.liveValue)}</code>
          </>
        )}
      </td>
      <td className="why">{d.justification}</td>
      <td className="action">
        {done ? (
          <span className="ok">✓ Remediated</span>
        ) : d.canRemediate ? (
          <button
            className="btn btn-primary"
            disabled={busyId === d.id}
            title={d.remediationDescription}
            onClick={() => onRemediate(d, approver)}
          >
            {busyId === d.id ? 'Applying…' : 'Approve fix'}
          </button>
        ) : (
          <span className="locked" title="MEDIUM/HIGH/CRITICAL drift is never auto-remediated">
            🔒 Manual review required
          </span>
        )}
      </td>
    </tr>
  );
}

function DriftTab({ drift, filter, approver, busyId, onRemediate }) {
  const rows = filter ? drift.filter((d) => d.riskLevel === filter) : drift;
  if (!drift.length) return <p className="empty">No drift detected. Infrastructure matches Terraform. 🎉</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Risk</th><th>Resource</th><th>Field</th><th>Declared → Live</th><th>Why this risk level</th><th>Action</th></tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <DriftRow key={d.id} d={d} approver={approver} busyId={busyId} onRemediate={onRemediate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResourcesTab({ resources }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Resource</th><th>Type</th><th>In Terraform</th><th>Live</th><th>Last scanned</th></tr></thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.resourceKey}>
              <td className="mono strong">{r.resourceKey}</td>
              <td className="muted">{r.resourceType}</td>
              <td>{r.declaredState ? '✓' : <span className="warn">✗ unmanaged</span>}</td>
              <td>{r.liveState ? '✓' : <span className="warn">✗ missing</span>}</td>
              <td className="muted">{time(r.lastScanned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab({ events }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Details</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className={e.eventType === 'REMEDIATION_BLOCKED' ? 'row-blocked' : ''}>
              <td className="muted">{e.id}</td>
              <td className="muted">{time(e.createdAt)}</td>
              <td className="mono strong">{e.eventType}</td>
              <td className="mono small">{JSON.stringify(e.payload)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('drift');
  const [drift, setDrift] = useState([]);
  const [summary, setSummary] = useState(null);
  const [resources, setResources] = useState([]);
  const [audit, setAudit] = useState([]);
  const [filter, setFilter] = useState(null);
  const [approver, setApprover] = useState('analyst');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [d, s, r, a] = await Promise.all([api.drift(), api.summary(), api.resources(), api.auditLog()]);
      setDrift(d); setSummary(s); setResources(r); setAudit(a);
    } catch (e) {
      setMessage({ kind: 'error', text: `Could not reach the API: ${e.message}` });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn, okText) => {
    setBusy(true); setMessage(null);
    try { await fn(); if (okText) setMessage({ kind: 'ok', text: okText }); }
    catch (e) { setMessage({ kind: 'error', text: e.message }); }
    finally { await refresh(); setBusy(false); }
  };

  const onScan = () => run(async () => {
    const r = await api.scan();
    setMessage({ kind: 'ok', text: `Scan #${r.scanId} complete: ${r.driftCount} drift finding(s).` });
  });
  const onReset = () => run(() => api.resetDemo(), 'Mock cloud reset to its drifted seed state. Run a scan to re-detect.');
  const onRemediate = async (d, who) => {
    setBusyId(d.id); setMessage(null);
    try {
      const r = await api.remediate(d.id, who);
      setMessage({ kind: 'ok', text: `Applied: ${r.description}` });
    } catch (e) {
      setMessage({ kind: 'error', text: e.message });
    } finally { setBusyId(null); await refresh(); }
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>IaC Drift Detector</h1>
          <p className="sub">Risk-weighted triage of Terraform vs. live infrastructure. Only low-risk drift can ever be auto-fixed.</p>
        </div>
        <div className="controls">
          <label className="approver">Approving as
            <input value={approver} onChange={(e) => setApprover(e.target.value)} />
          </label>
          <button className="btn" onClick={onReset} disabled={busy}>Reset demo env</button>
          <button className="btn btn-primary" onClick={onScan} disabled={busy}>{busy ? 'Working…' : 'Run scan'}</button>
        </div>
      </header>

      {message && <div className={`msg msg-${message.kind}`}>{message.text}</div>}

      <SummaryCards summary={summary} filter={filter} onFilter={setFilter} />

      <nav className="tabs">
        {[['drift', `Drift (${drift.length})`], ['resources', `Resources (${resources.length})`], ['audit', `Audit log (${audit.length})`]].map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {tab === 'drift' && <DriftTab drift={drift} filter={filter} approver={approver} busyId={busyId} onRemediate={onRemediate} />}
      {tab === 'resources' && <ResourcesTab resources={resources} />}
      {tab === 'audit' && <AuditTab events={audit} />}
    </div>
  );
}
