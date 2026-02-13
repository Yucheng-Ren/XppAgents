import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import StatsGrid from '../components/StatsGrid';
import SummaryBanner from '../components/SummaryBanner';
import { SeverityChart, CategoryChart } from '../components/Charts';
import FilterBar from '../components/FilterBar';
import IssueCard from '../components/IssueCard';
import { fetchAcceptedFixes } from '../api';
import { countIssues } from '../utils';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default function FileDetailPage({ data }) {
  const { fileName } = useParams();
  const decoded = decodeURIComponent(fileName);
  const fileData = data.files.find((f) => f.file === decoded);

  const [filter, setFilter] = useState('all');
  const [acceptedKeys, setAcceptedKeys] = useState(new Set());
  const [appliedKeys, setAppliedKeys] = useState(new Set());

  // Load accepted fixes on mount
  useEffect(() => {
    fetchAcceptedFixes().then((result) => {
      if (result.fixes) {
        const accepted = new Set(
          result.fixes
            .filter((f) => f.file === decoded || (!f.file && data.files.length === 1))
            .map((f) => `${f.title}|||${f.location || ''}`)
        );
        const applied = new Set(
          result.fixes
            .filter((f) => f.applied && (f.file === decoded || (!f.file && data.files.length === 1)))
            .map((f) => `${f.title}|||${f.location || ''}`)
        );
        setAcceptedKeys(accepted);
        setAppliedKeys(applied);
      }
    }).catch(() => {});
  }, [decoded, data.files.length]);

  const handleAccepted = useCallback((issue) => {
    setAcceptedKeys((prev) => {
      const next = new Set(prev);
      next.add(`${issue.title}|||${issue.location || ''}`);
      return next;
    });
  }, []);

  if (!fileData) {
    return (
      <>
        <Header fileLabel="Not found" date={data.date} totalIssues={0} />
        <div className="container">
          <div className="empty-state">
            <h2>File Not Found</h2>
            <p>
              The file <code>{decoded}</code> was not found in the review data.
            </p>
            <Link to="/" className="back-btn" style={{ marginTop: 20, display: 'inline-flex' }}>
              ← Back to file list
            </Link>
          </div>
        </div>
      </>
    );
  }

  const counts = countIssues([fileData]);
  const total = fileData.issues.length;
  const sorted = [...fileData.issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)
  );
  const filtered =
    filter === 'all' ? sorted : sorted.filter((i) => i.severity === filter);

  const acceptedCount = acceptedKeys.size;

  return (
    <>
      <Header fileLabel={fileData.file} date={data.date} totalIssues={total} />
      <div className="container">
        <Link to="/" className="back-btn">
          ← Back to file list
        </Link>

        <SummaryBanner
          title={fileData.file}
          summary={fileData.summary || ''}
          counts={counts}
        />
        <StatsGrid counts={counts} />

        <div className="charts-row">
          <SeverityChart counts={counts} />
          <CategoryChart issues={fileData.issues} />
        </div>

        <div className="section-header">
          <h2>Issues Found</h2>
          <span className="badge">
            {total} issue{total !== 1 ? 's' : ''}
          </span>
        </div>

        <FilterBar active={filter} onChange={setFilter} />

        {acceptedCount > 0 && (
          <div className="apply-bar">
            <div>
              <span className="accepted-count">{acceptedCount}</span> fixes
              accepted
            </div>
            <div className="apply-info">
              Run the <strong>xpp-fix-applier</strong> agent to apply accepted
              fixes to source files
            </div>
          </div>
        )}

        {filtered.map((issue, idx) => (
          <IssueCard
            key={`${issue.title}-${issue.location}-${idx}`}
            issue={issue}
            fileName={fileData.file}
            isAccepted={acceptedKeys.has(`${issue.title}|||${issue.location || ''}`)}
            appliedStatus={appliedKeys.has(`${issue.title}|||${issue.location || ''}`) ? 'applied' : null}
            onAccepted={handleAccepted}
          />
        ))}

        {fileData.strengths?.length > 0 && (
          <>
            <div className="section-header">
              <h2>Strengths</h2>
            </div>
            {fileData.strengths.map((s, i) => (
              <div key={i} className="strength-card">
                <p>
                  <span className="check-icon">✓</span> {s}
                </p>
              </div>
            ))}
          </>
        )}

        {fileData.recommendations?.length > 0 && (
          <>
            <div className="section-header">
              <h2>Recommendations</h2>
            </div>
            {fileData.recommendations.map((r, i) => (
              <div key={i} className="recommendation-card">
                <p>
                  <span className="rec-icon">💡</span> {r}
                </p>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
