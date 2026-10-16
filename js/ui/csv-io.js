// CSV 내보내기(설정 패널, F9-4), 이름 목록 붙여 넣기로 한꺼번에 색칠(목록 패널, F9-5), 트립픽 연동 JSON(F9-6, F6-8)
import { getState, setManyStatus } from '../store.js';
import { countryList, sidoList, placeInfo } from '../places.js';
import { tripsCSV, placesCSV, matchPlaces } from '../csv.js';
import { placeStatus, KR_SIDO } from '../stats.js';
import { tripPickExport } from '../trippick.js';
import { settings } from '../settings.js';
import { saveFile, dateStamp } from './settings-panel.js';
import { toast } from './toast.js';
import { esc } from '../env.js';

const $ = id => document.getElementById(id);
let pending = [];   // 표시할 장소 ID(아직 방문 전인 곳만)

export function exportCSV(kind) {
  const s = getState();
  const text = kind === 'trips' ? tripsCSV(s, placeInfo)
    : placesCSV(s, { countries: countryList(), sidoCodes: KR_SIDO, infoOf: placeInfo });
  const name = `voyage-atlas-${kind === 'trips' ? 'trips' : 'places'}-${dateStamp()}.csv`;
  // 엑셀에서 한글이 깨지지 않게 BOM을 붙임
  saveFile(new Blob([String.fromCharCode(0xfeff), text], { type: 'text/csv;charset=utf-8' }), name);
  const rows = text.trim().split('\r\n').length - 1;
  toast(`⤓ ${kind === 'trips' ? '여행' : '방문'} 목록 ${rows}줄을 CSV로 저장했어요 <span class="mono">${esc(name)}</span>`);
}

// ---------- 트립픽 연동 ----------
const tripPick = () => tripPickExport(getState(), { countries: countryList(), sidoCodes: KR_SIDO, infoOf: placeInfo, homeAirport: settings.homeAirport });

export function exportTripPick() {
  const data = tripPick();
  const name = `voyage-atlas-trippick-${dateStamp()}.json`;
  saveFile(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name);
  toast(`⤓ 트립픽용 파일을 저장했어요(나라 ${data.visited.countries.length}곳 · 후보 ${data.candidates.length}곳) <span class="mono">${esc(name)}</span>`);
}

async function copyExclude(kind) {
  const text = tripPick().excludeText[kind];
  if (!text) return toast(kind === 'overseas' ? '아직 다녀온 해외 나라가 없어요.' : '아직 다녀온 시도가 없어요.');
  try { await navigator.clipboard.writeText(text); toast(`트립픽 '추천 제외 조건'에 붙여 넣으세요 <span class="mono">${text.length}자</span>`); }
  catch { toast(`복사하지 못했어요: ${esc(text)}`); }
}

function preview() {
  const text = $('pasteText').value;
  const { found, missing } = matchPlaces(text, countryList(), sidoList());
  const s = getState();
  const fresh = found.filter(f => placeStatus(s, f.placeId) !== 'visited');
  pending = fresh.map(f => f.placeId);
  const names = list => list.map(id => esc(placeInfo(id).name)).join(', ');
  const already = found.length - fresh.length;
  $('pasteResult').innerHTML = !text.trim() ? '' : [
    fresh.length ? `<span class="ok-text">찾은 곳 ${fresh.length}곳</span>: ${names(pending)}` : '새로 표시할 곳이 없어요.',
    already ? `<span class="faint">이미 방문 ${already}곳은 그대로 둬요.</span>` : '',
    missing.length ? `<span class="warn-text">찾지 못한 이름 ${missing.length}개</span>: ${missing.map(esc).join(', ')}` : '',
  ].filter(Boolean).join('<br>');
  $('pasteApply').disabled = !pending.length;
  $('pasteApply').textContent = pending.length ? `✦ ${pending.length}곳 방문함으로 표시` : '방문함으로 표시';
}

function apply() {
  if (!pending.length) return;
  const n = pending.length;
  const undo = setManyStatus(pending, 'visited');
  $('pasteText').value = '';
  preview();
  toast(`✦ ${n}곳을 방문함으로 표시했어요`, { label: '실행 취소', fn: undo });
}

export function initCsvIO() {
  $('csvTrips').addEventListener('click', () => exportCSV('trips'));
  $('csvPlaces').addEventListener('click', () => exportCSV('places'));
  $('tpExport').addEventListener('click', exportTripPick);
  $('tpCopyAbroad').addEventListener('click', () => copyExclude('overseas'));
  $('tpCopyKorea').addEventListener('click', () => copyExclude('domestic'));
  let t = null;
  $('pasteText').addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 200); });
  $('pasteApply').addEventListener('click', apply);
  $('pasteFileBtn').addEventListener('click', () => $('pasteFile').click());
  $('pasteFile').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    $('pasteText').value = await file.text();
    preview();
  });
}

// 설정의 [이름 목록으로 한꺼번에 색칠]: 목록 패널을 열고 붙여 넣기 칸을 펼침
export function openPasteBox() {
  $('pasteBox').open = true;
  $('pasteText').focus();
}
