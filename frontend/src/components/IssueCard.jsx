import { useState, useEffect } from 'react';
import { acceptFix } from '../api';

export default function IssueCard({ issue, fileName, isAccepted, appliedStatus, onAccepted }) {
  const [status, setStatus] = useState(isAccepted ? 'accepted' : 'idle');
  const [statusText, setStatusText] = useState(
    isAccepted ? 'Saved to accepted-fixes.json' : ''
  );

  // Sync when isAccepted prop changes (e.g., after async fetch completes)
  useEffect(() => {
    if (isAccepted && status === 'idle') {
      setStatus('accepted');
      setStatusText(appliedStatus === 'applied' ? '✅ Applied to source' : 'Saved to accepted-fixes.json');
    }
  }, [isAccepted, appliedStatus]);

  const handleAccept = async () => {
    setStatus('saving');
    setStatusText('');
    try {
      await acceptFix({
        file: fileName,
        title: issue.title,
        severity: issue.severity,
        location: issue.location,
        category: issue.category,
        code: issue.code,
        fixCode: issue.fixCode,
        fixDescription: issue.fixDescription,
      });
      setStatus('accepted');
      setStatusText('Saved to accepted-fixes.json');
      onAccepted?.(issue);
    } catch {
      setStatus('idle');
      setStatusText('Error saving — try again');
    }
  };

  return (
    <div className={`issue-card ${issue.severity}`}>
      <div className="issue-header">
        <span className={`severity-badge ${issue.severity}`}>
          {issue.severity}
        </span>
        <span className="issue-title">{issue.title}</span>
      </div>

      {issue.location && (
        <div className="issue-location">{issue.location}</div>
      )}

      <div className="issue-description">{issue.description}</div>

      {issue.code && <pre>{issue.code}</pre>}

      {issue.fixCode ? (
        <>
          <div className="fix-label">✅ Recommended Fix</div>
          <pre className="fix-code">{issue.fixCode}</pre>
          {issue.fixDescription && (
            <div className="fix-description">{issue.fixDescription}</div>
          )}
          <div className="accept-bar">
            <button
              className={`accept-btn${status === 'accepted' ? ' accepted' : ''}`}
              disabled={status !== 'idle'}
              onClick={handleAccept}
            >
              {status === 'saving'
                ? 'Saving...'
                : status === 'accepted'
                ? '✓ Accepted'
                : '✓ Accept Fix'}
            </button>
            <span className="accept-status">{statusText}</span>
          </div>
        </>
      ) : issue.fix ? (
        <>
          <div className="fix-label">✅ Recommended Fix</div>
          <div className="fix-text">{issue.fix}</div>
        </>
      ) : null}
    </div>
  );
}
