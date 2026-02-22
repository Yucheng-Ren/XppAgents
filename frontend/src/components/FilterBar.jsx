import { useState } from 'react';

const FILTERS = [
  { key: 'all', label: 'All', icon: '' },
  { key: 'critical', label: 'Critical', icon: '🔴 ' },
  { key: 'high', label: 'High', icon: '🟠 ' },
  { key: 'medium', label: 'Medium', icon: '🟡 ' },
  { key: 'low', label: 'Low', icon: '🔵 ' },
];

export default function FilterBar({ active, onChange }) {
  return (
    <div className="filter-bar">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          className={`filter-btn${active === f.key ? ' active' : ''}`}
          onClick={() => onChange(f.key)}
        >
          {f.icon}{f.label}
        </button>
      ))}
    </div>
  );
}
