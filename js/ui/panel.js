// 오른쪽 슬라이드 패널(데스크톱 440px, 휴대폰 아래 시트): 한 번에 하나만 열림
const $ = id => document.getElementById(id);
let openEl = null, returnFocus = null;

export function openPanel(id) {
  if (openEl?.id === id) return closePanel();
  closePanel(false);
  const p = $(id);
  returnFocus = document.activeElement;
  p.hidden = false;
  openEl = p;
  document.querySelectorAll(`[aria-controls="${id}"]`).forEach(b => b.setAttribute('aria-expanded', 'true'));
  (p.querySelector('[data-autofocus]') ?? p.querySelector('button, input'))?.focus();
}

export function closePanel(restore = true) {
  if (!openEl) return;
  openEl.hidden = true;
  document.querySelectorAll(`[aria-controls="${openEl.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'false'));
  openEl = null;
  if (restore && returnFocus?.isConnected) returnFocus.focus();
}

export const isPanelOpen = id => openEl?.id === id;

export function initPanels() {
  document.querySelectorAll('[data-close-panel]').forEach(b => b.addEventListener('click', () => closePanel()));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openEl && document.getElementById('popover').hidden) closePanel();
  });
}
