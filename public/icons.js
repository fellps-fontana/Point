// Icones de linha, desenhados do zero (sem depender de biblioteca externa ou CDN).
// Cada entrada e o miolo de um <svg viewBox="0 0 24 24">...</svg>, usando currentColor.
const ICONS = {
  briefcase: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>`,
  book: `<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/>`,
  code: `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>`,
  palette: `<path d="M12 2a10 10 0 1 0 10 10c0-1.1-.9-2-2-2h-3a2 2 0 0 1-2-2c0-1 .7-1.7 1-2.6A2 2 0 0 0 14 3.4 9.9 9.9 0 0 0 12 2z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="7" cy="14.5" r="1.2"/><circle cx="10.5" cy="17" r="1.2"/>`,
  phone: `<path d="M21 16.4v3a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19.2 19.2 0 0 1-5.9-5.9 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 3a2 2 0 0 1-.5 2.1L7.4 10a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c1 .3 2 .6 3 .7a2 2 0 0 1 1.3 1.5z"/>`,
  home: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>`,
  receipt: `<path d="M6 2h12v19l-3-2-3 2-3-2-3 2V2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>`,
  wrench: `<path d="M21 7a4.5 4.5 0 0 1-6 4.2L8.8 17.4a1.8 1.8 0 1 1-2.5-2.5L12.5 9A4.5 4.5 0 0 1 17 3l-3 3 1.5 1.5 3-3z"/>`,
  coffee: `<path d="M18 8h1a3 3 0 0 1 0 6h-1"/><path d="M2 8h16v6a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>`,
  star: `<polygon points="12 2 15 9 22 9.3 16.5 14 18.2 21 12 17.3 5.8 21 7.5 14 2 9.3 9 9"/>`,
  folder: `<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>`,
};

const ICON_ORDER = ['briefcase', 'book', 'code', 'palette', 'phone', 'home', 'receipt', 'wrench', 'coffee', 'star', 'folder'];

function iconSvg(name, size = 18) {
  const inner = ICONS[name] || ICONS.briefcase;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
