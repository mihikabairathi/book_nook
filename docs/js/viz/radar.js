// Chart.js radar chart for per-book literary dimensions
// Requires Chart.js to be loaded globally

const AXES = [
  { key: 'pacing',             label: 'Pacing' },
  { key: 'mood_dark',          label: 'Darkness' },
  { key: 'character_focus',    label: 'Characters' },
  { key: 'world_building',     label: 'World' },
  { key: 'emotional_intensity',label: 'Emotion' },
  { key: 'depth',              label: 'Depth' },
  { key: 'tone_humor',         label: 'Humor' },
  { key: 'tone_literary',      label: 'Literary' },
];

let _chart = null;

function bookData(book) {
  return AXES.map(a => book[a.key] ?? 5);
}

export function initRadar(canvasId, book1, book2 = null) {
  if (!window.Chart) return;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const datasets = [
    {
      label: book1.title.slice(0, 25),
      data: bookData(book1),
      backgroundColor: 'rgba(192, 57, 43, 0.15)',
      borderColor: 'rgba(192, 57, 43, 0.85)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(192, 57, 43, 0.85)',
      pointRadius: 3,
    },
  ];

  if (book2) {
    datasets.push({
      label: book2.title.slice(0, 25),
      data: bookData(book2),
      backgroundColor: 'rgba(99, 102, 241, 0.12)',
      borderColor: 'rgba(99, 102, 241, 0.7)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(99, 102, 241, 0.7)',
      pointRadius: 3,
    });
  }

  _chart = new window.Chart(canvas, {
    type: 'radar',
    data: {
      labels: AXES.map(a => a.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: {
            display: false,
            stepSize: 2,
          },
          grid: {
            color: 'rgba(232, 213, 196, 0.6)',
          },
          angleLines: {
            color: 'rgba(232, 213, 196, 0.6)',
          },
          pointLabels: {
            font: { size: 11, family: "'Segoe UI', system-ui, sans-serif" },
            color: '#7d5a50',
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.raw}/10`,
          },
        },
      },
      animation: {
        duration: 300,
        easing: 'easeInOutQuart',
      },
    },
  });
}
