// 백업 권유 배너(PRD F9-3): 백업 후 바뀐 횟수를 세어 두었다가, 30일이 지났거나 20번 넘게 바뀌면 화면 아래에 띄웁니다.
// [지금 백업] → JSON 백업, [나중에] → 7일 동안 숨김. 백업하면(설정 패널 포함) 'va-backup' 이벤트로 횟수를 0으로 돌립니다.
import { backupNudge, SNOOZE_DAYS } from '../backup.js';
import { downloadBackup } from './settings-panel.js';

const $ = id => document.getElementById(id);
const K = { changes: 'va-backup-changes', last: 'va-last-backup', snooze: 'va-backup-snooze' };
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 무시 */ } };

let hasData = () => false;

function changes() {
  try { return JSON.parse(read(K.changes)) ?? { count: 0, since: null }; } catch { return { count: 0, since: null }; }
}

export function renderBackupBanner() {
  const c = changes();
  const n = hasData() ? backupNudge({ ...c, last: read(K.last), snooze: read(K.snooze) }) : null;
  $('backupBanner').hidden = !n;
  if (!n) return;
  $('bbText').textContent = n.kind === 'never' ? '아직 백업한 적이 없어요. 기록은 이 브라우저에만 저장돼요.'
    : n.kind === 'days' ? `마지막 백업 후 ${n.days}일이 지났어요. 기록을 파일로 남겨 두세요.`
    : `마지막 백업 후 기록이 ${n.count}번 바뀌었어요. 기록을 파일로 남겨 두세요.`;
}

/** 기록이 바뀔 때마다(store 구독). reset이면 처음부터 */
export function noteChange(meta = {}) {
  if (meta.reason === 'achievement') return;
  const c = meta.reason === 'reset' ? { count: 0, since: null } : changes();
  if (meta.reason !== 'reset') { c.count += 1; c.since ??= new Date().toISOString(); }
  write(K.changes, JSON.stringify(c));
  renderBackupBanner();
}

/** @param dataCheck () => 기록이 있는지 */
export function initBackupBanner(dataCheck) {
  hasData = dataCheck;
  $('bbBackup').addEventListener('click', downloadBackup);
  $('bbLater').addEventListener('click', () => {
    write(K.snooze, new Date(Date.now() + SNOOZE_DAYS * 864e5).toISOString());
    renderBackupBanner();
  });
  document.addEventListener('va-backup', () => { write(K.changes, null); write(K.snooze, null); renderBackupBanner(); });
  renderBackupBanner();
}
