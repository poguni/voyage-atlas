// 설정 패널의 AI 카드(PRD F10-1~F10-3): API 키(이 기기 / 이번 세션만, 가려진 입력, 연결 테스트),
// 모델 슬러그·단가 조회, 홈 공항, 환율, 누적 AI 비용
import { settings, setSetting } from '../settings.js';
import { getState } from '../store.js';
import { MODELS, AIRPORTS, activeModels } from '../ai/config.js';
import { getKey, setKey, keyRemembered, testKey, fetchPrices } from '../ai/openrouter.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let mode = 'local';

const usd = n => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
export const usdKrw = n => `${usd(n)} (약 ${Math.round(n * (settings.fxRate || 1400)).toLocaleString('ko-KR')}원)`;

function status(text, cls = '') { const el = $('keyStatus'); el.textContent = text; el.className = `set-note ${cls}`; }

function pressMode(m) {
  mode = m;
  $('keyMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}

function renderModels() {
  $('modelRows').innerHTML = activeModels(settings).map(m => `
    <label class="model-row"><span class="model ${m.key}"><i>${m.mono}</i>${esc(m.label)}</span>
      <input class="input input-sm mono" data-model="${m.key}" value="${esc(m.slug)}" spellcheck="false" aria-label="${esc(m.label)} 슬러그">
      <span class="faint small">${m.price ? `$${+m.price.in.toFixed(3)} / $${+m.price.out.toFixed(3)}` : '단가 미확인'}</span></label>`).join('');
}

function renderSpend() {
  const log = getState().costLog ?? [];
  const total = log.reduce((a, c) => a + (c.cost ?? 0), 0);
  $('aiSpend').textContent = log.length ? `지금까지 AI 추천 비용: ${usdKrw(total)} · 호출 ${log.length}회` : '아직 AI 추천을 쓰지 않았어요.';
}

// 단가 조회(모델 목록 API, 키 필요 없음). 조회한 값은 설정에 보관
export async function refreshPrices({ quiet = false } = {}) {
  const slugs = activeModels(settings).map(m => m.slug);
  try {
    const found = await fetchPrices(slugs);
    setSetting('aiPrices', { ...settings.aiPrices, ...found });
    const missing = slugs.filter(s => !found[s]);
    if (!quiet) $('priceInfo').textContent = missing.length ? `찾지 못한 모델: ${missing.join(', ')}` : `조회함 · ${new Date().toLocaleDateString('ko-KR')}`;
  } catch (err) {
    if (!quiet) $('priceInfo').textContent = `조회하지 못했어요: ${err.message}`;
  }
  renderModels();
}

export function initAiSettings() {
  pressMode(getKey() && !keyRemembered() ? 'session' : 'local');
  $('keyForm').addEventListener('submit', e => e.preventDefault()); // 키 칸에서 Enter를 눌러도 새로 고침되지 않게
  $('keyMode').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) pressMode(b.dataset.mode); });
  $('keySave').addEventListener('click', () => {
    const k = $('setKey').value.trim();
    if (!k) return status('키를 입력해 주세요.', 'warn-text');
    setKey(k, mode === 'local');
    $('setKey').value = '';
    status(`키를 ${mode === 'local' ? '이 기기에' : '이번 세션에만'} 저장했어요.`, 'ok-text');
    document.dispatchEvent(new CustomEvent('va-key'));
  });
  $('keyTest').addEventListener('click', async () => {
    const k = $('setKey').value.trim() || getKey();
    if (!k) return status('먼저 키를 입력해 주세요.', 'warn-text');
    status('확인하는 중…');
    try {
      const d = await testKey(k);
      const left = d.limit != null ? ` · 남은 한도 $${(+d.limit_remaining).toFixed(2)}` : ' · 한도 없음';
      status(`✓ 연결됐어요(${d.label ?? '키'}) · 이번 달 사용 $${(+(d.usage_monthly ?? d.usage ?? 0)).toFixed(2)}${left}`, 'ok-text');
    } catch (err) { status(`✕ ${err.message}${err.detail ? ` — ${err.detail}` : ''}`, 'warn-text'); }
  });
  $('keyClear').addEventListener('click', () => {
    setKey('', false);
    $('setKey').value = '';
    status('키를 지웠어요.');
    document.dispatchEvent(new CustomEvent('va-key'));
  });

  $('modelRows').addEventListener('change', e => {
    const key = e.target.dataset.model;
    if (!key) return;
    const v = e.target.value.trim(), def = MODELS.find(m => m.key === key).slug;
    setSetting('aiSlugs', { ...settings.aiSlugs, [key]: v && v !== def ? v : undefined });
    refreshPrices();
  });
  $('priceBtn').addEventListener('click', () => refreshPrices());

  $('setAirport').innerHTML = Object.entries(AIRPORTS).map(([code, a]) => `<option value="${code}">${a.name}(${code})</option>`).join('');
  $('setAirport').value = settings.homeAirport;
  $('setAirport').addEventListener('change', e => setSetting('homeAirport', e.target.value));
  $('setFx').value = settings.fxRate;
  $('setFx').addEventListener('change', e => { const v = +e.target.value; if (v >= 100) { setSetting('fxRate', v); renderSpend(); } });

  // 패널을 열 때마다 최신 정보로
  $('settingsBtn').addEventListener('click', () => {
    status(getKey() ? `키가 ${keyRemembered() ? '이 기기에' : '이번 세션에만'} 저장돼 있어요.` : '아직 키가 없어요. openrouter.ai에서 발급받아 넣어 주세요.');
    renderModels();
    renderSpend();
  });
  renderModels();
}
