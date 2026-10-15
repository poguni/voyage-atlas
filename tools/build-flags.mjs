// flag-icons(MIT) 4:3 국기 SVG 중 국가 사전에 있는 것만 assets/flags/로 복사합니다.
// 국기 이모지는 윈도우에서 "KR" 같은 글자로 보이므로 쓰지 않습니다(DESIGN.md 12장).
import { readFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';

const SRC = 'node_modules/flag-icons/flags/4x3';
const OUT = 'assets/flags';
mkdirSync(OUT, { recursive: true });

const countries = JSON.parse(readFileSync('data/countries.ko.json', 'utf8'));
const want = new Set(countries.filter(c => c.iso2).map(c => c.iso2.toLowerCase()));

// 사전에서 빠진 국기 파일은 지웁니다.
for (const f of readdirSync(OUT)) if (!want.has(f.replace('.svg', ''))) unlinkSync(`${OUT}/${f}`);

const missing = [];
for (const code of want) {
  const src = `${SRC}/${code}.svg`;
  if (existsSync(src)) copyFileSync(src, `${OUT}/${code}.svg`);
  else missing.push(code);
}
const noIso = countries.filter(c => !c.iso2).map(c => c.ko);
console.log(`${OUT}: 국기 ${want.size - missing.length}개 복사`);
if (missing.length) console.log(`flag-icons에 없는 코드: ${missing.join(', ')}`);
console.log(`ISO 코드가 없어 중립 깃발로 표시: ${noIso.join(', ')}`);
