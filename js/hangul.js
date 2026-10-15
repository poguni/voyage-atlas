// 한글 검색 도우미: 초성 검색(예: "ㅍㄹㅅ" → 프랑스), 초성·글자 섞어 쓰기(예: "프ㄹ")
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export const isCho = ch => CHO.includes(ch);

export function choOf(ch) {
  const c = ch.charCodeAt(0) - 0xAC00;
  return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
}

export const normalize = s => String(s).toLowerCase().replace(/[\s·・\-().,']/g, '');

// text 안에서 q가 시작하는 위치(없으면 -1). q의 글자가 초성이면 text 글자의 초성과 비교합니다.
export function matchIndex(text, q) {
  const t = normalize(text), s = normalize(q);
  if (!s) return -1;
  outer: for (let i = 0; i <= t.length - s.length; i++) {
    for (let j = 0; j < s.length; j++) {
      const a = t[i + j], b = s[j];
      if (a === b) continue;
      if (isCho(b) && choOf(a) === b) continue;
      continue outer;
    }
    return i;
  }
  return -1;
}
