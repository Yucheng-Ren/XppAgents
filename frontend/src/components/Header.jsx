import ProjectSwitcher from './ProjectSwitcher';

export default function Header({ fileLabel, date, totalIssues, branchInfo, projectProps }) {
  return (
    <div className="header">
      <div className="header-top-row">
        <div>
          <h1>X++ Code Review Dashboard</h1>
          <p className="subtitle">Automated review powered by xpp-code-reviewer agent</p>
        </div>
        {projectProps && <ProjectSwitcher {...projectProps} />}
      </div>
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
