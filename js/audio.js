// AOTA.EXE - 8-bit Sound Effects (Web Audio API)
const Audio8bit = {
  _ctx: null,
  _enabled: true,

  init() {
    // AudioContext はユーザー操作後に作成
    document.addEventListener('click', () => this._ensureContext(), { once: true });
    document.addEventListener('keydown', () => this._ensureContext(), { once: true });
  },

  _ensureContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  },

  _playTone(freq, duration, type = 'square', volume = 0.15) {
    if (!this._ctx || !this._enabled) return;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + duration);
  },

  _playSequence(notes, tempo = 120) {
    if (!this._ctx || !this._enabled) return;
    const beatDur = 60 / tempo;
    let time = this._ctx.currentTime;
    for (const note of notes) {
      if (note.freq > 0) {
        const osc = this._ctx.createOscillator();
        const gain = this._ctx.createGain();
        osc.type = note.type || 'square';
        osc.frequency.value = note.freq;
        const dur = (note.dur || 1) * beatDur;
        gain.gain.setValueAtTime(note.vol || 0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.9);
        osc.connect(gain);
        gain.connect(this._ctx.destination);
        osc.start(time);
        osc.stop(time + dur);
      }
      time += (note.dur || 1) * beatDur;
    }
  },

  // 入力確定音（ドラクエのコマンド決定音風）
  confirm() {
    this._playTone(880, 0.08, 'square', 0.12);
    setTimeout(() => this._playTone(1320, 0.12, 'square', 0.12), 60);
  },

  // テキスト表示音（1文字ごと）
  typeChar() {
    this._playTone(440 + Math.random() * 60, 0.03, 'square', 0.06);
  },

  // ステータス変動音
  statUp() {
    this._playSequence([
      { freq: 523, dur: 0.3 },
      { freq: 659, dur: 0.3 },
      { freq: 784, dur: 0.5 },
    ], 240);
  },

  statDown() {
    this._playSequence([
      { freq: 392, dur: 0.3 },
      { freq: 330, dur: 0.3 },
      { freq: 262, dur: 0.5 },
    ], 240);
  },

  // 進化音（ステージアップ）
  evolve() {
    this._playSequence([
      { freq: 523, dur: 0.25 },
      { freq: 659, dur: 0.25 },
      { freq: 784, dur: 0.25 },
      { freq: 1047, dur: 0.25 },
      { freq: 1319, dur: 0.5 },
    ], 300);
  },

  // バトル開始
  battleStart() {
    this._playSequence([
      { freq: 196, dur: 0.2, type: 'sawtooth' },
      { freq: 262, dur: 0.2, type: 'sawtooth' },
      { freq: 330, dur: 0.2, type: 'sawtooth' },
      { freq: 392, dur: 0.4, type: 'sawtooth' },
    ], 300);
  },

  // 攻撃音
  attack() {
    this._playTone(200, 0.05, 'sawtooth', 0.15);
    setTimeout(() => this._playTone(150, 0.08, 'sawtooth', 0.12), 50);
  },

  // クリティカル
  critical() {
    this._playTone(600, 0.05, 'square', 0.15);
    setTimeout(() => {
      this._playTone(800, 0.05, 'square', 0.15);
      setTimeout(() => this._playTone(1200, 0.12, 'square', 0.18), 50);
    }, 50);
  },

  // 被ダメ
  damage() {
    this._playTone(120, 0.1, 'sawtooth', 0.15);
    setTimeout(() => this._playTone(80, 0.15, 'sawtooth', 0.1), 80);
  },

  // 回避
  dodge() {
    this._playTone(600, 0.04, 'triangle', 0.1);
    setTimeout(() => this._playTone(800, 0.06, 'triangle', 0.08), 60);
  },

  // 勝利
  victory() {
    this._playSequence([
      { freq: 523, dur: 0.2 },
      { freq: 523, dur: 0.2 },
      { freq: 523, dur: 0.2 },
      { freq: 0, dur: 0.1 },
      { freq: 415, dur: 0.3 },
      { freq: 466, dur: 0.3 },
      { freq: 523, dur: 0.3 },
      { freq: 0, dur: 0.1 },
      { freq: 466, dur: 0.2 },
      { freq: 523, dur: 0.6 },
    ], 280);
  },

  // 敗北
  defeat() {
    this._playSequence([
      { freq: 330, dur: 0.4, type: 'triangle' },
      { freq: 294, dur: 0.4, type: 'triangle' },
      { freq: 262, dur: 0.4, type: 'triangle' },
      { freq: 196, dur: 0.8, type: 'triangle' },
    ], 160);
  },

  // エラー音
  error() {
    this._playTone(150, 0.15, 'square', 0.1);
    setTimeout(() => this._playTone(100, 0.2, 'square', 0.08), 150);
  },

  toggle() {
    this._enabled = !this._enabled;
    return this._enabled;
  },
};
