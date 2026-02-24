import { Link } from 'react-router-dom';
import Header from '../components/Header';
import StatsGrid from '../components/StatsGrid';
import SummaryBanner from '../components/SummaryBanner';
import { SeverityChart, CategoryChart } from '../components/Charts';
import { countIssues, fileIcon } from '../utils';

export default function FileListPage({ data }) {
  const allCounts = countIssues(data.files);
  const totalIssues = data.files.reduce((s, f) => s + f.issues.length, 0);
  const allIssues = data.files.flatMap((f) => f.issues);

  const fileLabel = `${data.files.length} file${data.files.length !== 1 ? 's' : ''} reviewed`;
  const branchInfo =
    data.mode === 'branch-diff'
      ? `🌿 <strong>${data.branch || ''}</strong> ← <strong>${data.parentBranch || ''}</strong>`
      : undefined;

  return (
    <>
      <Header
        fileLabel={fileLabel}
        date={data.date}
        totalIssues={totalIssues}
        branchInfo={branchInfo}
      />
      <div className="container">
        {data.mode === 'branch-diff' && (
          <div className="nav-tabs">
            <span className="nav-tab active">📊 Review</span>
            <Link to="/changes" className="nav-tab">📝 Changes</Link>
          </div>
        )}
        <SummaryBanner
          title="Review Summary"
          summary={data.summary || ''}
          counts={allCounts}
        />
        <StatsGrid counts={allCounts} />

        <div className="charts-row">
          <SeverityChart counts={allCounts} />
          <CategoryChart issues={allIssues} />
        </div>

        <div className="section-header">
          <h2>Reviewed Files</h2>
          <span className="badge">
            {data.files.length} file{data.files.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="file-grid">
          {data.files.map((f) => {
            const fc = countIssues([f]);
            const total = f.issues.length;
            return (
              <Link
                key={f.file}
                className="file-card"
                to={`/file/${encodeURIComponent(f.file)}`}
              >
                <div className="file-name">
                  <span className="file-icon">{fileIcon(f.file)}</span>
                  {f.file}
                </div>
                <div className="file-summary">
                  {f.summary || `${total} issue${total !== 1 ? 's' : ''} found`}
                </div>
                <div className="file-stats">
                  {total === 0 ? (
                    <span className="file-stat clean">✓ No issues</span>
                  ) : (
                    <>
                      {fc.critical > 0 && (
                        <span className="file-stat critical">
                          {fc.critical} Critical
                        </span>
                      )}
                      {fc.high > 0 && (
                        <span className="file-stat high">{fc.high} High</span>
                      )}
                      {fc.medium > 0 && (
                        <span className="file-stat medium">
                          {fc.medium} Medium
                        </span>
                      )}
                      {fc.low > 0 && (
                        <span className="file-stat low">{fc.low} Low</span>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
