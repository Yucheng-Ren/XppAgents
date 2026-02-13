export default function StatsGrid({ counts }) {
  return (
    <div className="stats-grid">
      <div className="stat-card critical">
        <div className="count">{counts.critical}</div>
        <div className="label">Critical</div>
      </div>
      <div className="stat-card high">
        <div className="count">{counts.high}</div>
        <div className="label">High</div>
      </div>
      <div className="stat-card medium">
        <div className="count">{counts.medium}</div>
        <div className="label">Medium</div>
      </div>
      <div className="stat-card low">
        <div className="count">{counts.low}</div>
        <div className="label">Low</div>
      </div>
    </div>
  );
}
