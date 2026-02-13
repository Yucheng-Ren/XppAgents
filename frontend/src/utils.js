export function countIssues(files) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  files.forEach((f) =>
    f.issues.forEach((i) => {
      if (counts[i.severity] !== undefined) counts[i.severity]++;
    })
  );
  return counts;
}

export function fileIcon(fileName) {
  if (fileName.includes('Table')) return '🗃️';
  if (fileName.includes('Form')) return '📋';
  return '📄';
}
