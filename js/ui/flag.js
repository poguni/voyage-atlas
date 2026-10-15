// 국기 표시: 국기 이모지는 쓰지 않고 assets/flags/의 SVG 이미지를 씁니다(DESIGN.md 12장).
// 이미지가 없거나 불러오지 못하면 중립 깃발 아이콘으로 바꾸고, ISO 코드 글자는 화면에 보이지 않게 합니다.
import { esc } from '../env.js';

const NEUTRAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';

const neutral = (name, h) =>
  `<span class="flag flag-neutral" role="img" aria-label="${esc(name)} 깃발" style="--flag-h:${h}px">${NEUTRAL_SVG}</span>`;

// 크기 h(px, 높이 기준): 툴팁 16, 목록 20, 팝오버 30, 상세 56
export function flagHTML(iso2, name, h = 20) {
  if (!iso2) return neutral(name, h);
  return `<img class="flag" src="assets/flags/${esc(iso2.toLowerCase())}.svg" alt="${esc(name)} 국기" data-name="${esc(name)}" style="--flag-h:${h}px" decoding="async">`;
}

// 불러오기에 실패한 국기 이미지를 중립 깃발로 바꿉니다(대체 글자가 보이지 않도록).
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('flag')) return;
  const h = parseFloat(img.style.getPropertyValue('--flag-h')) || 20;
  img.outerHTML = neutral(img.dataset.name || '', h);
}, true);
