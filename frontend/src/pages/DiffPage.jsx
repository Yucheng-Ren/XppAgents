import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { fetchDiff } from '../api';

/**
 * Parse a unified diff string into structured file entries.
 * Each entry: { header, oldFile, newFile, isDeleted, isNew, hunks[] }
 * Each hunk: { header, oldStart, oldCount, newStart, newCount, lines[] }
 * Each line: { type: 'context'|'add'|'remove'|'header', content, oldLine, newLine }
 */
function parseDiff(diffText) {
  const files = [];
  const fileParts = diffText.split(/^diff --git /m).filter(Boolean);

  for (const part of fileParts) {
    const lines = part.split('\n');
    const headerLine = 'diff --git ' + lines[0];

    let oldFile = '', newFile = '';
    let isDeleted = false, isNew = false;
    const metaLines = [];
    let hunkStart = -1;

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('--- ')) {
        oldFile = l.replace(/^--- (a\/|b\/)?/, '');
        metaLines.push(l);
      } else if (l.startsWith('+++ ')) {
        newFile = l.replace(/^\+\+\+ (a\/|b\/)?/, '');
        metaLines.push(l);
      } else if (l.startsWith('deleted file')) {
        isDeleted = true;
        metaLines.push(l);
      } else if (l.startsWith('new file')) {
        isNew = true;
        metaLines.push(l);
      } else if (l.startsWith('@@')) {
        hunkStart = i;
        break;
      } else {
        metaLines.push(l);
      }
    }

    const displayName = isDeleted
      ? oldFile || newFile
      : newFile || oldFile;

    const hunks = [];
    let currentHunk = null;
    let oldLine = 0, newLine = 0;

    for (let i = hunkStart; i >= 0 && i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('@@')) {
        const match = l.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (match) {
          currentHunk = {
            header: l,
            oldStart: parseInt(match[1]),
            oldCount: parseInt(match[2] ?? '1'),
            newStart: parseInt(match[3]),
            newCount: parseInt(match[4] ?? '1'),
            context: match[5]?.trim() || '',
            lines: [],
          };
          hunks.push(currentHunk);
          oldLine = currentHunk.oldStart;
          newLine = currentHunk.newStart;
        }
      } else if (currentHunk) {
        if (l.startsWith('+')) {
          currentHunk.lines.push({ type: 'add', content: l.slice(1), newLine: newLine++ });
        } else if (l.startsWith('-')) {
          currentHunk.lines.push({ type: 'remove', content: l.slice(1), oldLine: oldLine++ });
        } else if (l.startsWith('\\')) {
          currentHunk.lines.push({ type: 'info', content: l });
        } else {
          currentHunk.lines.push({ type: 'context', content: l.slice(1) || l, oldLine: oldLine++, newLine: newLine++ });
        }
      }
    }

    files.push({
      header: headerLine,
      oldFile,
      newFile,
      displayName,
      isDeleted,
      isNew,
      hunks,
      addCount: hunks.reduce((s, h) => s + h.lines.filter(l => l.type === 'add').length, 0),
      removeCount: hunks.reduce((s, h) => s + h.lines.filter(l => l.type === 'remove').length, 0),
    });
  }

  return files;
}

function FileNav({ files, activeIndex, onSelect }) {
  return (
    <div className="diff-file-nav">
      <div className="diff-file-nav-header">
        <span className="diff-file-nav-title">Changed Files</span>
        <span className="badge">{files.length}</span>
      </div>
      <div className="diff-file-nav-list">
        {files.map((f, i) => (
          <button
            key={i}
            className={`diff-file-nav-item${i === activeIndex ? ' active' : ''}`}
            onClick={() => onSelect(i)}
            title={f.displayName}
          >
            <span className="diff-file-nav-status">
              {f.isDeleted ? '🗑️' : f.isNew ? '✨' : '📝'}
            </span>
            <span className="diff-file-nav-name">{shortName(f.displayName)}</span>
            <span className="diff-file-nav-stats">
              {f.addCount > 0 && <span className="diff-stat-add">+{f.addCount}</span>}
              {f.removeCount > 0 && <span className="diff-stat-remove">-{f.removeCount}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function shortName(filePath) {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

function DiffFileBlock({ file, reviewFiles }) {
  const [collapsed, setCollapsed] = useState(false);

  // Try to find matching review file for linking
  const matchedReview = reviewFiles?.find(rf => {
    const fn = shortName(file.displayName).replace('.xml', '').replace('.txt', '');
    return rf.file === fn || rf.file.includes(fn) || fn.includes(rf.file.replace(/ \(deleted\)/, ''));
  });

  const totalAdd = file.addCount;
  const totalRemove = file.removeCount;

  return (
    <div className="diff-file-block" id={`diff-file-${encodeURIComponent(file.displayName)}`}>
      <div className="diff-file-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="diff-file-header-left">
          <span className="diff-collapse-icon">{collapsed ? '▶' : '▼'}</span>
          <span className="diff-file-status-badge">
            {file.isDeleted ? 'DELETED' : file.isNew ? 'NEW' : 'MODIFIED'}
          </span>
          <span className="diff-file-path" title={file.displayName}>{file.displayName}</span>
        </div>
        <div className="diff-file-header-right">
          {totalAdd > 0 && <span className="diff-stat-add">+{totalAdd}</span>}
          {totalRemove > 0 && <span className="diff-stat-remove">-{totalRemove}</span>}
          {matchedReview && (
            <Link
              to={`/file/${encodeURIComponent(matchedReview.file)}`}
              className="diff-review-link"
              onClick={(e) => e.stopPropagation()}
              title="View review for this file"
            >
              View Review →
            </Link>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="diff-file-content">
          {file.hunks.length === 0 ? (
            <div className="diff-empty-hunk">Binary file or no content changes</div>
          ) : (
            file.hunks.map((hunk, hi) => (
              <div className="diff-hunk" key={hi}>
                <div className="diff-hunk-header">{hunk.header}</div>
                <table className="diff-table">
                  <tbody>
                    {hunk.lines.map((line, li) => (
                      <tr key={li} className={`diff-line diff-line-${line.type}`}>
                        <td className="diff-line-num diff-line-num-old">
                          {line.type === 'remove' || line.type === 'context' ? line.oldLine : ''}
                        </td>
                        <td className="diff-line-num diff-line-num-new">
                          {line.type === 'add' || line.type === 'context' ? line.newLine : ''}
                        </td>
                        <td className="diff-line-marker">
                          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : line.type === 'info' ? '\\' : ' '}
                        </td>
                        <td className="diff-line-content">
                          <pre>{line.content}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function DiffPage({ data }) {
  const [diffData, setDiffData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [showAllFiles, setShowAllFiles] = useState(true);
  const contentRef = useRef(null);

  useEffect(() => {
    fetchDiff()
      .then((result) => {
        if (result) {
          setDiffData(result);
        } else {
          setError('No diff data available. Ensure the git repository is accessible.');
        }
      })
      .catch(() => setError('Failed to fetch diff data.'))
      .finally(() => setLoading(false));
  }, []);

  const files = diffData ? parseDiff(diffData.diff) : [];

  const totalAdd = files.reduce((s, f) => s + f.addCount, 0);
  const totalRemove = files.reduce((s, f) => s + f.removeCount, 0);

  const handleFileSelect = (idx) => {
    setActiveFileIndex(idx);
    if (showAllFiles) {
      // Scroll to file block
      const el = document.getElementById(`diff-file-${encodeURIComponent(files[idx].displayName)}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const branchInfo = data?.mode === 'branch-diff'
    ? `🌿 <strong>${data.branch || ''}</strong> ← <strong>${data.parentBranch || ''}</strong>`
    : undefined;

  if (loading) {
    return (
      <>
        <Header fileLabel="Loading diff..." date={data?.date} totalIssues={0} branchInfo={branchInfo} />
        <div className="container">
          <div className="loading">Loading diff data...</div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header fileLabel="Diff View" date={data?.date} totalIssues={0} branchInfo={branchInfo} />
        <div className="container">
          <Link to="/" className="back-btn">← Back to review</Link>
          <div className="empty-state">
            <h2>Diff Not Available</h2>
            <p>{error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        fileLabel={`${files.length} file${files.length !== 1 ? 's' : ''} changed`}
        date={data?.date}
        totalIssues={data?.files?.reduce((s, f) => s + f.issues.length, 0) ?? 0}
        branchInfo={branchInfo}
      />
      <div className="container">
        <div className="diff-toolbar">
          <Link to="/" className="back-btn">← Back to review</Link>
          {files.length > 0 && (
            <>
              <div className="diff-summary-stats">
                <span className="diff-stat-add">+{totalAdd} additions</span>
                <span className="diff-stat-remove">-{totalRemove} deletions</span>
                <span className="diff-stat-files">{files.length} files</span>
              </div>
              <div className="diff-view-toggle">
                <button
                  className={`filter-btn${showAllFiles ? ' active' : ''}`}
                  onClick={() => setShowAllFiles(true)}
                >All Files</button>
                <button
                  className={`filter-btn${!showAllFiles ? ' active' : ''}`}
                  onClick={() => setShowAllFiles(false)}
                >Single File</button>
              </div>
            </>
          )}
        </div>

        {files.length === 0 ? (
          <div className="empty-state">
            <h2>No Changes</h2>
            <p>
              The branches <strong>{diffData?.branch}</strong> and{' '}
              <strong>{diffData?.parentBranch}</strong> have no code differences.
              This can happen if the branches have been merged or are at the same commit.
            </p>
          </div>
        ) : (
          <div className="diff-layout">
            <FileNav files={files} activeIndex={activeFileIndex} onSelect={handleFileSelect} />
            <div className="diff-main" ref={contentRef}>
              {showAllFiles ? (
                files.map((f, i) => (
                  <DiffFileBlock key={i} file={f} reviewFiles={data?.files} />
                ))
              ) : (
                files[activeFileIndex] && (
                  <DiffFileBlock file={files[activeFileIndex]} reviewFiles={data?.files} />
                )
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
