// CSV 내보내기·가져오기, 백업 권유 테스트(PRD F9-3~F9-5, Phase 5g): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toCSV, parseCSV, tripsCSV, placesCSV, namesFromText, matchPlaces } from '../js/csv.js';
import { backupNudge, emptyState } from '../js/backup.js';
import { KR_SIDO } from '../js/stats.js';

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const topo = JSON.parse(readFileSync('data/korea-sido.json', 'utf8'));
const sido = topo.objects.sido.geometries.map(g => g.properties);
const TODAY = '2026-10-16';
const NAMES = { 'country:392': '일본', 'country:410': '대한민국', 'country:620': '포르투갈', 'city:1': '교토', 'kr-sido:50': '제주특별자치도' };
const infoOf = id => ({ name: NAMES[id] ?? id, kind: id.startsWith('country:') ? 'country' : id.startsWith('kr-sido:') ? 'sido' : 'city' });

test('CSV 글자: 쉼표·따옴표·줄바꿈을 감싸고, 다시 읽으면 같음', () => {
  const rows = [['이름', '메모'], ['교토', '골목, "말차"\n둘째 줄']];
  const text = toCSV(rows);
  assert.equal(text, '이름,메모\r\n교토,"골목, ""말차""\n둘째 줄"\r\n');
  assert.deepEqual(parseCSV(String.fromCharCode(0xfeff) + text), rows);
  assert.deepEqual(parseCSV('일본\t프랑스\r\n미국\t'), [['일본', '프랑스'], ['미국', '']]);   // 엑셀에서 복사(탭)
});

test('여행·방문 CSV: 머리줄, 경로, 나라, 예정 여행, 방문 횟수', () => {
  const s = {
    ...emptyState(),
    places: { 'city:1': { countryId: '392', name_ko: '교토' }, 'country:620': { status: 'visited', note: '다시 가고 싶다' } },
    trips: [
      { id: 'b', start: '2027-01-10', end: '2027-01-12', datePrecision: 'day', stops: [{ placeId: 'kr-sido:50' }] },
      { id: 'a', start: '2019-04-01', end: '2019-04-05', datePrecision: 'day', title: '교토 봄', companion: 'family', rating: 5, stops: [{ placeId: 'city:1' }, { placeId: 'country:392' }] },
    ],
  };
  const trips = parseCSV(tripsCSV(s, infoOf, TODAY));
  assert.deepEqual(trips[0], ['시작', '끝', '일수', '상태', '제목', '경로', '나라', '동행', '별점', '메모']);
  assert.deepEqual(trips[1], ['2019-04-01', '2019-04-05', '5', '다녀옴', '교토 봄', '교토 → 일본', '일본', '가족', '5', '']);
  assert.equal(trips[2][3], '예정');
  const places = parseCSV(placesCSV(s, { countries, sidoCodes: KR_SIDO, infoOf, today: TODAY }));
  assert.deepEqual(places.slice(1).map(r => r[1]), ['일본', '포르투갈', '교토']);   // 미래 제주 여행은 아직 방문 아님
  assert.deepEqual(places[1], ['나라', '일본', '', '방문', '1', '2019-04-01', '2019-04-01', '']);
  assert.deepEqual(places[2].slice(3), ['방문', '1', '', '', '다시 가고 싶다']);
  assert.equal(places[3][2], '일본');
});

test('이름 목록 인식: 한글·영어·ISO 코드·다른 이름·시도, 못 찾은 이름', () => {
  const { found, missing } = matchPlaces('일본, France\nUSA; 영국(잉글랜드)\tKR\n제주\n서울특별시\n튀르키예\n일본\n아틀란티스', countries, sido);
  assert.deepEqual(found.map(f => f.placeId), ['country:392', 'country:250', 'country:840', 'country:826', 'country:410', 'kr-sido:50', 'kr-sido:11', 'country:792']);
  assert.deepEqual(missing, ['아틀란티스']);
  // 머리줄이 있는 CSV(앱에서 내보낸 방문 목록)는 '장소' 열만
  assert.deepEqual(namesFromText('종류,장소,나라\n나라,일본,\n도시,교토,일본'), ['일본', '교토']);
});

test('백업 권유: 30일 또는 변경 20번, 변경이 없거나 미뤄 두면 숨김', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  const ago = d => new Date(now - d * 864e5).toISOString();
  assert.equal(backupNudge({ count: 0, last: ago(90), now }), null);
  assert.equal(backupNudge({ count: 5, last: ago(10), now }), null);
  assert.deepEqual(backupNudge({ count: 5, last: ago(31), now }), { kind: 'days', days: 31, count: 5 });
  assert.equal(backupNudge({ count: 20, last: ago(2), now }).kind, 'changes');
  assert.equal(backupNudge({ count: 3, since: ago(40), now }).kind, 'never');
  assert.equal(backupNudge({ count: 3, since: ago(5), now }), null);
  assert.equal(backupNudge({ count: 30, last: ago(2), snooze: ago(-3), now }), null);
});
