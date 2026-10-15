// 한글 검색 테스트: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchIndex, choOf } from '../js/hangul.js';

test('초성 검색: ㅍㄹㅅ → 프랑스', () => {
  assert.equal(choOf('프'), 'ㅍ');
  assert.equal(matchIndex('프랑스', 'ㅍㄹㅅ'), 0);
  assert.equal(matchIndex('프랑스령 폴리네시아', 'ㅍㄹㅅ'), 0);
  assert.equal(matchIndex('일본', 'ㅍㄹㅅ'), -1);
});

test('초성과 글자 섞어 쓰기, 중간 일치, 띄어쓰기 무시', () => {
  assert.equal(matchIndex('프랑스', '프ㄹ'), 0);
  assert.equal(matchIndex('남아프리카공화국', '아프리카'), 1);
  assert.equal(matchIndex('보스니아 헤르체고비나', '보스니아헤르'), 0);
});

test('영어는 대소문자를 가리지 않음', () => {
  assert.equal(matchIndex('South Korea', 'korea'), 5);
  assert.equal(matchIndex('Japan', 'JAP'), 0);
});
