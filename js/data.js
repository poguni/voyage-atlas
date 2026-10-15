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
