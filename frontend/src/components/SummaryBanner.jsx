export default function SummaryBanner({ title, summary, counts }) {
  const cls =
    counts.critical > 0 ? '' : counts.high > 0 ? ' warn' : ' pass';
  return (
    <div className={`summary-banner${cls}`}>
      <h2>{title}</h2>
      <p>{summary}</p>
    </div>
  );
}
