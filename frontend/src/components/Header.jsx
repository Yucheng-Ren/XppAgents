export default function Header({ fileLabel, date, totalIssues, branchInfo }) {
  return (
    <div className="header">
      <h1>X++ Code Review Dashboard</h1>
      <p className="subtitle">Automated review powered by xpp-code-reviewer agent</p>
      <div className="review-meta">
        <span>
          📄 <strong>{fileLabel || '—'}</strong>
        </span>
        <span>
          🕐 <strong>{date ? new Date(date).toLocaleString() : '—'}</strong>
        </span>
        <span>
          📊 <strong>{totalIssues ?? '—'}</strong> issues found
        </span>
        {branchInfo && (
          <span dangerouslySetInnerHTML={{ __html: branchInfo }} />
        )}
      </div>
    </div>
  );
}
