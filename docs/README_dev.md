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

라이브러리(D3, topojson-client)와 글꼴은 CDN에서 불러오므로 처음 실행할 때는 인터넷 연결이 필요합니다. 오프라인 실행은 Phase 5의 PWA에서 지원합니다.

## 2. 테스트

```bash
npm test
```

- `tests/stats.test.js`: 방문 횟수(단순 표시 흡수), 대한민국 자동 방문, 경유 포함 여부, 국가·대륙·한국 통계, 백업 왕복·합치기·마이그레이션
- `tests/trips.test.js`: 여행 일수 합집합(겹친 날), 국내·해외, 연말을 넘는 여행, 예정 여행 제외, 많이 간 나라, 기록으로 본 나, D-day
- `tests/share.test.js`: 공유 포스터 숫자(월드·한국), 날짜 범위, 4가지 크기 배치 겹침, 저장 해상도
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
│  ├─ stats.js         방문 횟수·국가·한국 통계(순수 함수, 테스트 대상)
│  ├─ backup.js        데이터 기본값, 마이그레이션, 백업 파일 만들기·읽기·합치기(순수 함수)
│  ├─ settings.js      설정(테마, 애니메이션 줄이기, 경유 포함)
│  ├─ places.js        장소 ID → 이름·국기·좌표, 검색 항목(도시는 처음 검색할 때 불러옴)
│  ├─ format.js        날짜·별점·동행·색 표시
│  ├─ hangul.js        초성 검색
│  ├─ env.js           글자 이스케이프, 조사, 숫자 카운트업
│  ├─ data.js          data/*.json 불러오기, 국가 사전
│  ├─ map/             engine.js(지도 엔진), world.js(세계), korea.js(대한민국), effects.js(금박 긁기·파티클·별), mini.js(경로·장소·별 지도)
│  ├─ screens/         trips.js(연대기), wish.js(위시리스트), stats-view.js(통계), share.js(공유 스튜디오)
│  ├─ share/           model.js(포스터 숫자·배치), poster.js(Canvas 그리기)
│  └─ ui/              popover, hud, search, toast, panel, list-panel, settings-panel, trip-form, wish-form, place-detail, dream, flag(국기 이미지), tooltip, sky
├─ data/               지도·국가 데이터(전처리 결과)
├─ assets/flags/       국기 SVG
├─ tools/              데이터 전처리 스크립트
├─ tests/              테스트
├─ docs/               문서
└─ design/             디자인 가이드와 시안
```

## 5. 저장소에 올리지 않는 것

`.gitignore`에 `node_modules/`(`npm install`로 복구), `tools/.cache/`(원본 다운로드), `.omc/`, `.playwright-mcp/`(도구 상태·캡처)가 들어 있습니다.
