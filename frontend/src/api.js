const API_BASE = '';

export async function fetchReviewData() {
  const resp = await fetch(`${API_BASE}/api/review`);
  if (!resp.ok) return null;
  const raw = await resp.json();

  // Normalize: support both legacy single-file and new multi-file format
  if (raw.files && Array.isArray(raw.files)) {
    return raw;
  }

  // Legacy single-file → wrap into multi-file
  return {
    date: raw.date,
    summary: raw.summary,
    mode: 'full',
    files: [
      {
        file: raw.file,
        summary: raw.summary,
        issues: raw.issues || [],
        strengths: raw.strengths || [],
        recommendations: raw.recommendations || [],
      },
    ],
  };
}

export async function fetchAcceptedFixes() {
  const resp = await fetch(`${API_BASE}/api/accepted-fixes`);
  if (!resp.ok) return { fixes: [] };
  return resp.json();
}

export async function acceptFix(fix) {
  const resp = await fetch(`${API_BASE}/api/accept-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fix),
  });
  if (!resp.ok) throw new Error('Failed to accept fix');
  return resp.json();
}

export async function clearAcceptedFixes() {
  const resp = await fetch(`${API_BASE}/api/accepted-fixes`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('Failed to clear');
  return resp.json();
}
