// 설정 패널(DESIGN.md 9장 설정·백업·복원, PRD F9-2, F10-4, F10-5)
// 테마, 애니메이션 줄이기, 경유 통계 포함, JSON 백업·복원, 저장 공간, 데이터 초기화(2단계), 데이터 출처
import { settings, setSetting, setTheme, getTheme } from '../settings.js';
import { getState, restoreState, resetState } from '../store.js';
import { toBackup, parseBackup } from '../backup.js';
import { toast } from './toast.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
const LAST_BACKUP = 'va-last-backup';
let restoreMode = 'overwrite';

const fmtDate = iso => {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function pressSeg(groupId, attr, value) {
  $(groupId).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
}

function showLastBackup() {
  let v = null;
  try { v = localStorage.getItem(LAST_BACKUP); } catch { /* 무시 */ }
  $('lastBackup').textContent = v ? `마지막 백업: ${fmtDate(v)}` : '아직 백업하지 않았어요.';
}

async function showStorage() {
  const el = $('storageInfo'), bar = $('storageBar');
  if (!navigator.storage?.estimate) { el.textContent = '이 브라우저는 저장 공간 정보를 알려 주지 않아요.'; return; }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const pct = quota ? usage / quota * 100 : 0;
  const mb = n => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 0);
  el.textContent = `${mb(usage)}MB 사용 / ${mb(quota)}MB 가능 (${pct.toFixed(pct < 1 ? 2 : 0)}%)`;
  bar.style.width = Math.max(1, pct) + '%';
  bar.parentElement.classList.toggle('warn', pct >= 80);
}

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(toBackup(getState()), null, 2)], { type: 'application/json' });
  const d = new Date();
  const name = `voyage-atlas-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  try { localStorage.setItem(LAST_BACKUP, d.toISOString()); } catch { /* 무시 */ }
  showLastBackup();
  toast(`⤓ 백업 파일을 저장했어요 <span class="mono">${esc(name)}</span>`);
}

// 파일 선택 창 열기(빈 상태 카드의 [JSON 불러오기]에서도 사용)
export function pickRestoreFile(mode) {
  if (mode) { restoreMode = mode; pressSeg('restoreMode', 'mode', mode); }
  $('restoreFile').click();
}

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const incoming = parseBackup(await file.text());
    const undo = restoreState(incoming, restoreMode);
    toast(`⤒ 백업을 불러왔어요(${restoreMode === 'merge' ? '합치기' : '덮어쓰기'})`, { label: '실행 취소', fn: undo });
  } catch (err) {
    toast(`불러오지 못했어요: ${esc(err.message)}`);
  }
}

export function initSettingsPanel() {
  pressSeg('themeSeg', 'theme', getTheme());
  $('themeSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-theme]');
    if (!b) return;
    setTheme(b.dataset.theme);
    pressSeg('themeSeg', 'theme', b.dataset.theme);
  });

  $('setReduce').checked = settings.reduceMotion;
  $('setReduce').addEventListener('change', e => setSetting('reduceMotion', e.target.checked));
  $('setTransit').checked = settings.includeTransit;
  $('setTransit').addEventListener('change', e => setSetting('includeTransit', e.target.checked));

  $('backupBtn').addEventListener('click', downloadBackup);
  $('restoreMode').addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (b) { restoreMode = b.dataset.mode; pressSeg('restoreMode', 'mode', restoreMode); }
  });
  $('restoreBtn').addEventListener('click', () => pickRestoreFile());
  $('restoreFile').addEventListener('change', onFile);

  // 데이터 초기화: 1단계 버튼 → 2단계 확인
  $('resetBtn').addEventListener('click', () => { $('resetConfirm').hidden = false; $('resetBtn').hidden = true; $('resetYes').focus(); });
  $('resetNo').addEventListener('click', () => { $('resetConfirm').hidden = true; $('resetBtn').hidden = false; $('resetBtn').focus(); });
  $('resetYes').addEventListener('click', () => {
    resetState();
    $('resetConfirm').hidden = true;
    $('resetBtn').hidden = false;
    toast('모든 기록을 지웠어요.');
  });

  // 패널을 열 때마다 최신 정보로
  $('settingsBtn').addEventListener('click', () => { showLastBackup(); showStorage(); });
  showLastBackup();
}
