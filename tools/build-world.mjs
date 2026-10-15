// world-atlas 110m·50m 세계 지도를 data/로 복사합니다.
// - 남극(010)은 그리지 않으므로 뺍니다.
// - ISO 숫자 코드가 없는 지형(코소보 등)에는 country-meta.mjs의 x- ID를 붙입니다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { NO_ID } from './country-meta.mjs';

mkdirSync('data', { recursive: true });

for (const res of ['110m', '50m']) {
  const topo = JSON.parse(readFileSync(`node_modules/world-atlas/countries-${res}.json`, 'utf8'));
  const geoms = topo.objects.countries.geometries;
  topo.objects.countries.geometries = geoms
    .filter(g => g.id !== '010')
    .map(g => {
      if (g.id === undefined) {
        const m = NO_ID[g.properties.name];
        if (!m) throw new Error(`ID 없는 지형을 처리할 수 없음: ${g.properties.name}`);
        g.id = m[0];
      }
      return g;
    });
  // 국경선 묶음(land 객체)은 앱에서 쓰지 않으므로 뺍니다.
  delete topo.objects.land;
  const out = `data/countries-${res}.json`;
  writeFileSync(out, JSON.stringify(topo));
  console.log(`${out}: 지형 ${topo.objects.countries.geometries.length}개`);
}
