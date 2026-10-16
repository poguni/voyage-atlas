// 사진 썸네일 크기 계산(순수 함수, PRD F2-10)
export const THUMB_MAX = 640;      // 긴 변(px)
export const THUMB_QUALITY = 0.82; // JPEG 품질

// 긴 변을 max에 맞춰 줄인 크기(작은 사진은 그대로)
export function fitSize(w, h, max = THUMB_MAX) {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}
