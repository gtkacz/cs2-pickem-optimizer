const icon = (path: string, className = 'icon') =>
  `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${path}</svg>`;

export const check = icon('<path d="m3.5 8.5 3 3 6-7"/>');
export const chevron = icon('<path d="m4 6 4 4 4-4"/>', 'icon chevron');
export const cross = icon('<path d="m5 5 6 6m0-6-6 6"/>');

// The Swiss stage's record fan: 0–0 splits into 1–0 / 0–1, then into 2–0 / 1–1 / 0–2.
export const mark = `<svg class="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
  <circle cx="3" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="10" cy="14" r="2"/>
  <circle cx="17" cy="2.5" r="2"/><circle cx="17" cy="10" r="2"/><circle cx="17" cy="17.5" r="2"/></svg>`;
