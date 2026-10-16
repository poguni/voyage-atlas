// AI 추천 기본 설정값(PRD 9.1~9.2). 슬러그·단가는 자주 바뀌므로 설정에서 고칠 수 있고, 단가는 모델 목록 API로 다시 조회합니다.
// 2026-10-16 OpenRouter 모델 목록에서 확인: 세 모델 모두 response_format(json_schema)·structured_outputs 지원,
// 응답 usage.cost에 실제 비용(USD)이 들어옴. 웹 검색(:online, 요청당 약 $0.01)은 P1(F7-12)이라 아직 쓰지 않습니다.
export const MODELS = [
  { key: 'claude', label: 'Claude Sonnet 5.5', mono: 'CL', slug: 'anthropic/claude-sonnet-5.5', price: { in: 2, out: 10 } },
  { key: 'gpt', label: 'GPT-6 Luna', mono: 'GP', slug: 'openai/gpt-6-luna', price: { in: 0.1, out: 0.5 } },
  { key: 'gemini', label: 'Gemini 3.8 Flash', mono: 'GM', slug: 'google/gemini-3.8-flash', price: { in: 0.825, out: 4.125 } },
];   // price: USD / 100만 토큰

export const modelOf = key => MODELS.find(m => m.key === key);

// 설정에서 바꾼 슬러그와 조회한 단가를 반영한 모델 목록
export const activeModels = (s = {}) => MODELS.map(m => {
  const slug = s.aiSlugs?.[m.key] || m.slug;
  return { ...m, slug, price: s.aiPrices?.[slug] ?? (slug === m.slug ? m.price : null) };
});

// 홈 공항(F10-3): 연대기 경로 지도와 AI 추천 출발지
export const AIRPORTS = {
  ICN: { name: '인천', ll: [126.45, 37.46] },
  GMP: { name: '김포', ll: [126.8, 37.56] },
  PUS: { name: '김해', ll: [128.94, 35.18] },
  CJU: { name: '제주', ll: [126.49, 33.51] },
  TAE: { name: '대구', ll: [128.66, 35.9] },
  CJJ: { name: '청주', ll: [127.5, 36.72] },
};

export const DEFAULT_FX = 1400;   // 원/USD(설정에서 바꿈)
export const OUT_TOKENS = 2200;   // 모델당 예상 출력 토큰(추천 5곳)
