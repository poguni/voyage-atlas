// 세 모델 결과 병합과 합의 표시(순수 함수, PRD 9.5, F7-8)
// 같은 나라 + 정규화한 이름이 같거나, 좌표가 50km 이내면 같은 곳으로 봅니다.

// 발음 기호(Kyōto의 ō)는 떼고 한글은 다시 합칩니다(NFD → 기호 제거 → NFC).
export const normName = s => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase()
  .replace(/\b(city|town|prefecture|province|island|islands)\b/g, '')
  .replace(/(특별시|광역시|시|섬)$/u, '')
  .replace(/[^\p{L}\p{N}]/gu, '');

export function distKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371, rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const recKey = r => `${r.iso2}:${normName(r.name_en || r.name_ko)}`;

const sameKeyName = (a, b) => {
  const names = r => [normName(r.name_en), normName(r.name_ko)].filter(Boolean);
  const nb = names(b);
  return names(a).some(n => nb.includes(n));
};

/**
 * 좌표 검증(F7-8): 나라 경계 밖이면 나라 중심으로 옮기고 needsCheck 표시
 * @param contains (iso2, ll) => true | false | null(경계 데이터 없음)
 * @param centroid iso2 => [lon, lat] | null
 */
export function checkCoords(rec, contains, centroid) {
  const inside = contains(rec.iso2, rec.ll);
  if (inside !== false) return { ...rec, needsCheck: false };
  const c = centroid(rec.iso2);
  return { ...rec, ll: c ?? rec.ll, needsCheck: true };
}

/**
 * @param results [{ model, recs }] 성공한 모델만
 * @param excluded 제외한 추천 키 Set
 * @returns 묶음 배열: { key, iso2, name_ko, name_en, ll, type, models[], byModel{model: rec}, rank, months, hours, budget, photos, needsCheck }
 *          합의 많은 순 → 모델 목록에서 앞에 나온 순(조건 적합도 대신)
 */
export function mergeResults(results, { excluded = new Set() } = {}) {
  const groups = [];
  for (const { model, recs } of results) {
    recs.forEach((rec, i) => {
      let g = groups.find(x => x.iso2 === rec.iso2 && (sameKeyName(x, rec) || distKm(x.ll, rec.ll) <= 50));
      if (!g) {
        g = { key: recKey(rec), iso2: rec.iso2, name_ko: rec.name_ko, name_en: rec.name_en, ll: rec.ll, type: rec.type, models: [], byModel: {}, ranks: [], needsCheck: rec.needsCheck ?? false };
        groups.push(g);
      }
      if (g.byModel[model]) return;          // 한 모델이 같은 곳을 두 번 추천하면 처음 것만
      g.models.push(model);
      g.byModel[model] = rec;
      g.ranks.push(i);
      // 좌표 검증을 통과한 좌표를 우선
      if (g.needsCheck && !rec.needsCheck) { g.ll = rec.ll; g.needsCheck = false; }
    });
  }
  return groups
    .filter(g => !excluded.has(g.key))
    .map(g => {
      const recs = g.models.map(m => g.byModel[m]);
      const hours = recs.map(r => r.hours).filter(h => h != null);
      return {
        ...g,
        rank: g.ranks.reduce((a, b) => a + b, 0) / g.ranks.length,
        months: [...new Set(recs.flatMap(r => r.months))].sort((a, b) => a - b),
        hours: hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length * 2) / 2 : null,
        budget: recs.find(r => r.budget)?.budget ?? null,
        photos: [...new Set(recs.flatMap(r => r.photos))].slice(0, 4),
      };
    })
    .sort((a, b) => b.models.length - a.models.length || a.rank - b.rank);
}
