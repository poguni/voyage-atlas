// 정적 데이터(data/*.json) 불러오기. 같은 파일은 한 번만 받습니다.
const cache = new Map();

export function loadJSON(path) {
  if (!cache.has(path)) {
    const p = fetch(path).then(r => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));   // 실패하면 다음에 다시 시도
    cache.set(path, p);
  }
  return cache.get(path);
}

// 국가 사전: { list, byId }
export async function loadCountries() {
  const list = await loadJSON('data/countries.ko.json');
  return { list, byId: new Map(list.map(c => [c.id, c])) };
}

export const CONT = { AS: '아시아', EU: '유럽', AF: '아프리카', NA: '북아메리카', SA: '남아메리카', OC: '오세아니아', AN: '남극권' };

// 대륙 색(차트·HUD 전용, DESIGN.md 3장 색 사용 규칙)
export const CONT_COLOR = { AS: '#2EC4B6', EU: '#9B5DE5', NA: '#4C8DFF', OC: '#F15BB5', AF: '#FFB347', SA: '#7BD389' };
export const CONT_ORDER = ['AS', 'EU', 'AF', 'NA', 'SA', 'OC'];
