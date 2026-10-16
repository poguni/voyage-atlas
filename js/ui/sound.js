// 효과음(PRD 6.5, F10-4): 금박 긁는 소리, 배지 획득 차임. 기본은 꺼짐이고 설정에서 켭니다.
// 소리 파일 없이 Web Audio로 만듭니다(오프라인에서도 같은 소리).
import { settings } from '../settings.js';

let ac = null;
function ctx() {
  if (!settings.sound) return null;
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch { return null; }
}

// 금박 긁기: 걸러 낸 잡음을 짧게 여러 번(손톱으로 긁는 느낌), quick이면 짧게
export function playScratch({ quick = false } = {}) {
  const a = ctx();
  if (!a) return;
  const dur = quick ? 0.25 : 0.75, t0 = a.currentTime;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(2600, t0);
  bp.frequency.linearRampToValueAtTime(5200, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  // 긁는 손놀림 3~4번
  const strokes = quick ? 2 : 4;
  for (let k = 0; k < strokes; k++) {
    const s = t0 + (dur / strokes) * k;
    g.gain.linearRampToValueAtTime(0.16, s + 0.02);
    g.gain.linearRampToValueAtTime(0.03, s + dur / strokes);
  }
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

// 배지 차임: 도·미·솔·도 아르페지오(사인파 + 배음, 천천히 사라짐)
export function playChime() {
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + 0.02;
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    const s = t0 + i * 0.11;
    for (const [mul, vol] of [[1, 0.12], [2.01, 0.03]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.value = f * mul;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 1.4);
      o.connect(g).connect(a.destination);
      o.start(s);
      o.stop(s + 1.5);
    }
  });
}
