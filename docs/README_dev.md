# 나의 여정 지도(Voyage Atlas): 개발 안내

## 1. 앱 실행

앱은 빌드 없이 실행되는 정적 웹 앱입니다. 다만 ES 모듈과 `fetch`를 쓰기 때문에 `index.html`을 더블클릭(`file://`)으로 열면 동작하지 않고, **로컬 서버**로 열어야 합니다.

```bash
# 처음 한 번: 개발 도구 설치(데이터 전처리·테스트·로컬 서버용)
npm install

# 로컬 서버 실행 → 브라우저에서 http://localhost:8080
npm start
```

Node가 없다면 Python으로도 실행할 수 있습니다.

```bash
python -m http.server 8080
```

라이브러리(D3, topojson-client)와 글꼴은 CDN에서 불러오므로 처음 실행할 때는 인터넷 연결이 필요합니다.

### 1.1 PWA·오프라인(Phase 5g)

- 한 번 열면 서비스 워커(`sw.js`)가 앱 코드·라이브러리·글꼴·지도·도시 데이터·국기 전체를 캐시에 받아 둡니다. 그 뒤로는 인터넷 없이 열고 기록할 수 있습니다(AI 추천만 온라인 필요).
- 앱 코드(html·js·css)는 **네트워크 먼저**라서, 배포한 뒤 캐시 이름(`va-cache-v1`)을 바꾸지 않아도 다음에 열 때 최신 코드가 적용됩니다. 지도·국기·데이터는 **캐시 먼저**(뒤에서 새로 받음)라서 `npm run data`로 데이터를 바꾸면 **두 번째로 열 때** 반영됩니다.
- `localhost`에서도 서비스 워커가 동작합니다. 데이터가 바로 안 바뀌어 보이면 한 번 더 새로 고치거나, 개발자 도구 → Application → Service workers에서 [Update on reload]를 켭니다.
- 3D 지구본 라이브러리(globe.gl, 약 1.9MB)는 [✦ 3D]를 처음 누를 때 받아 캐시합니다. 오프라인에서 3D를 쓰려면 온라인일 때 한 번 열어 두어야 합니다.
- 한글 글꼴은 화면에 나온 글자의 글꼴 조각만 캐시합니다. 오프라인에서 처음 보는 글자는 기본 글꼴로 보일 수 있습니다.
- 앱 아이콘: `assets/icons/icon.svg`(일반), `icon-maskable.svg`(안드로이드 마스크용·애플)를 고친 뒤 PNG(`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` 180px)를 다시 만듭니다. 크롬으로 SVG를 열어 같은 크기로 캡처하면 됩니다(`chrome --headless --screenshot --window-size=512,512 --default-background-color=00000000`).

## 2. 테스트

```bash
npm test
```

- `tests/stats.test.js`: 방문 횟수(단순 표시 흡수), 대한민국 자동 방문, 경유 포함 여부, 국가·대륙·한국 통계, 백업 왕복·합치기·마이그레이션
- `tests/trips.test.js`: 여행 일수 합집합(겹친 날), 국내·해외, 연말을 넘는 여행, 예정 여행 제외, 많이 간 나라, 기록으로 본 나, D-day, 전체 연대기 재생 장면
- `tests/badges.test.js`: 배지 달성·진행률, 달성 날짜(여행 순서대로 다시 쌓기), 새로 달성한 배지, 다음 목표, 보관함 순서
- `tests/ai.test.js`: AI 이력 요약(메모·제목 미포함), 제외 목록, 응답 검증, 3모델 병합·합의, 좌표 보정, 비용 추정(저장된 응답 샘플, 실제 호출 없음)
- `tests/share.test.js`: 공유 포스터 숫자(월드·한국·올해의 여정·여행 카드), 날짜 범위, 크기별 배치 겹침, 저장 해상도(A3 포함)
- `tests/phase6.test.js`: 트립픽 JSON(다녀온 곳·후보·제외 조건 200자), 위시 보드 순서·배치, 사진 썸네일 크기
- `tests/data-io.test.js`: CSV 쓰기·읽기(따옴표·줄바꿈·탭), 여행·방문 CSV, 이름 목록 인식(한글·영어·ISO·다른 이름·시도), 백업 권유 조건
- `tests/hangul.test.js`: 초성 검색

`tests/data.test.js`는 지도·국가·국기 데이터를 검사합니다.
- 국가 기준(UN 193 + 옵서버 2 = 195), 대륙별 국가 수
- 세계 지도의 모든 지형이 국가 사전과 연결되는지
- 국기 SVG 파일 존재, 앱 코드에 국기 이모지가 없는지
- 한국 17칸, 최신 코드, 폴리곤 감는 방향, **독도·울릉도·제주도 존재**

## 3. 데이터 다시 만들기

`data/`와 `assets/flags/`는 저장소에 들어 있으므로 평소에는 다시 만들 필요가 없습니다. 원본 데이터나 규칙을 바꿨을 때만 실행합니다.

```bash
npm run data     # 세계 지도 → 국가 사전 → 한국 경계 → 국기 순서로 실행
npm test         # 결과 검사
```

| 스크립트 | 입력 | 출력 |
|---|---|---|
| `tools/build-world.mjs` | `node_modules/world-atlas` | `data/countries-110m.json`, `data/countries-50m.json` |
| `tools/build-countries.mjs` | 50m 지도, `tools/country-meta.mjs` | `data/countries.ko.json` |
| `tools/build-korea.mjs` | admdongkor 행정동 경계(자동 다운로드, `tools/.cache/`) | `data/korea-sido.json`, `data/korea-sigungu.json` |
| `tools/build-flags.mjs` | `node_modules/flag-icons`, 국가 사전 | `assets/flags/*.svg` |
| `tools/build-cities.mjs` | GeoNames 도시·한국어 이름(자동 다운로드, 약 220MB, `tools/.cache/`), `tools/city-ko-overrides.csv`, 시군구 경계 | `data/cities.json` |

국가의 한국어 이름·대륙·UN 지위를 고치려면 `tools/country-meta.mjs`를, 도시의 한국어 이름을 고치려면 `tools/city-ko-overrides.csv`(geonameid,한국어 이름,다른 이름|…)를 수정한 뒤 `npm run data`를 실행합니다.

## 4. 폴더 구조

```
VoyageAtlas/
├─ index.html          앱 셸(import map, 글꼴, 공통 SVG 정의)
├─ css/                tokens.css(디자인 토큰), app.css(공통 스타일)
├─ js/
│  ├─ main.js          진입점: 화면 이동(#home·#trips·#wish·#stats), 보기 전환, 장소 클릭, HUD·검색·패널 연결
│  ├─ store.js         상태 저장소(구독 + IndexedDB 자동 저장, 실행 취소용 되돌리기 함수)
│  ├─ stats.js         방문 횟수·국가·한국·이동 거리·월별·동행 통계(순수 함수, 테스트 대상)
│  ├─ backup.js        데이터 기본값, 마이그레이션, 백업 파일 만들기·읽기·합치기(순수 함수)
│  ├─ settings.js      설정(테마, 애니메이션 줄이기, 효과음, 경유 포함)
│  ├─ csv.js           CSV 내보내기·이름 목록 가져오기(순수 함수)
│  ├─ pwa.js           서비스 워커 등록·캐시 채우기·오프라인 표시
│  ├─ photos.js        장소 대표 사진(줄이기·IndexedDB 별도 저장소·백업용 변환), thumb.js(크기 계산)
│  ├─ trippick.js      트립픽 연동 JSON(순수 함수)
│  ├─ places.js        장소 ID → 이름·국기·좌표, 검색 항목(도시는 처음 검색할 때 불러옴)
│  ├─ format.js        날짜·별점·동행·색 표시
│  ├─ badges.js        마일스톤·배지 계산(달성, 달성 날짜, 다음 목표)
│  ├─ hangul.js        초성 검색
│  ├─ env.js           글자 이스케이프, 조사, 숫자 카운트업
│  ├─ data.js          data/*.json 불러오기, 국가 사전
│  ├─ map/             engine.js(지도 엔진), world.js(세계), korea.js(대한민국 시도·시군구), pins.js(도시 핀), globe.js(지구본·전환 연출), globe3d.js(3D 시네마틱 지구본, globe.gl 지연 로딩), effects.js(금박 긁기·파티클·별), mini.js(경로·장소·별 지도)
│  ├─ screens/         trips.js(연대기), wish.js(위시리스트), ai.js(AI 추천), stats-view.js(통계), share.js(공유 스튜디오)
│  ├─ share/           model.js(포스터 숫자·배치: 월드·한국·올해의 여정·여행 카드·위시 보드, A3), poster.js(Canvas 그리기·경로)
│  ├─ ai/              config.js(모델·공항 기본값), prompt.js(이력 요약·프롬프트·스키마·검증), merge.js(병합·합의·좌표 보정), openrouter.js(API 호출·키 보관)
│  └─ ui/              popover, hud(세계·한국·지구본 FLIGHT LOG), search, toast, panel, list-panel, settings-panel, ai-settings(AI 키·모델·홈 공항·환율), milestone(배지 코인·축하 창), sound(효과음), backup-banner(백업 권유), csv-io(CSV 저장·붙여 넣기 색칠), timelapse(전체 연대기 재생), legend(범례·색칠 기준), trip-form, wish-form, place-detail, dream, flag(국기 이미지), tooltip, sky
├─ data/               지도·국가 데이터(전처리 결과)
├─ assets/flags/       국기 SVG
├─ assets/icons/       앱 아이콘(PWA)
├─ manifest.webmanifest, sw.js   PWA 설정, 서비스 워커
├─ tools/              데이터 전처리 스크립트
├─ tests/              테스트
├─ docs/               문서
└─ design/             디자인 가이드와 시안
```

## 5. 저장소에 올리지 않는 것

`.gitignore`에 `node_modules/`(`npm install`로 복구), `tools/.cache/`(원본 다운로드), `.omc/`, `.playwright-mcp/`(도구 상태·캡처)가 들어 있습니다.
