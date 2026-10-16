// 앱 설정(localStorage, PRD 10.1): 테마, 애니메이션 줄이기, 효과음(기본 끔), 경유 통계 포함, 홈 공항, 환율, AI 모델 슬러그·단가
// API 키는 여기에 두지 않습니다(ai/openrouter.js).
const KEY = 'va-settings';
const DEFAULTS = { reduceMotion: false, sound: false, includeTransit: false, homeAirport: 'ICN', fxRate: 1400, aiSlugs: {}, aiPrices: {} };
const MEDIA = matchMedia('(prefers-reduced-motion: reduce)');
const subs = new Set();

const read = (k, fallback) => { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 사생활 보호 모드 등: 이번 실행 동안만 유지 */ } };

export const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(read(KEY, '{}'))); } catch { /* 기본값 사용 */ }

export const getTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

// 시스템 설정이나 앱 설정 중 하나라도 켜져 있으면 애니메이션을 줄입니다(DESIGN.md 10장).
export const motionReduced = () => MEDIA.matches || settings.reduceMotion;

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  write('va-theme', theme);
  applyMotion();   // 테마 색이 바뀌므로 구독자(HUD 등)에 알림
}

export function setSetting(key, value) {
  settings[key] = value;
  write(KEY, JSON.stringify(settings));
  applyMotion();
}

export function onSettings(fn) { subs.add(fn); }

function applyMotion() {
  const reduce = motionReduced();
  document.documentElement.classList.toggle('reduce-motion', reduce);
  // 금박 광택(SMIL) 멈춤/재생
  const defs = document.querySelector('.svg-defs');
  if (defs?.pauseAnimations) reduce ? defs.pauseAnimations() : defs.unpauseAnimations();
  subs.forEach(fn => fn(settings));
}

MEDIA.addEventListener?.('change', applyMotion);
applyMotion();
