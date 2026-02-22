import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export function SeverityChart({ counts }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Critical', 'High', 'Medium', 'Low'],
        datasets: [
          {
            data: [counts.critical, counts.high, counts.medium, counts.low],
            backgroundColor: ['#dc2626', '#ea580c', '#ca8a04', '#2563eb'],
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16, usePointStyle: true, font: { size: 12 } },
          },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [counts]);

  return (
    <div className="chart-card">
      <h3>Issue Distribution by Severity</h3>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export function CategoryChart({ issues }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const cats = {};
    issues.forEach((i) => {
      const c = i.category || 'Other';
      cats[c] = (cats[c] || 0) + 1;
    });

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: Object.keys(cats),
        datasets: [
          {
            label: 'Issues',
            data: Object.values(cats),
            backgroundColor: '#6366f1',
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { size: 12 } },
            grid: { color: '#f1f5f9' },
          },
          x: {
            ticks: { font: { size: 12 } },
            grid: { display: false },
          },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [issues]);

  return (
    <div className="chart-card">
      <h3>Issues by Category</h3>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
