// AOTA.EXE - State Management
const STORAGE_KEY = 'aota_exe_save';

const DEFAULT_STATE = {
  entries: [],
  stats: { STR: 30, INT: 30, AGI: 30, CHA: 30, WIS: 30, LCK: 30 },
  traits: [],
  epithet: '',
  changeHistory: [],
  battleHistory: [],
  lastBattleTime: null,
  imageB64: null,
  totalInputCount: 0,
};

const GameState = {
  _state: null,

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        this._state = { ...DEFAULT_STATE, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('Save data corrupted, starting fresh');
        this._state = { ...DEFAULT_STATE };
      }
    } else {
      this._state = { ...DEFAULT_STATE };
    }
    return this._state;
  },

  get() {
    if (!this._state) this.init();
    return this._state;
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
  },

  getStage() {
    const count = this._state.totalInputCount;
    if (count >= 70) return { num: 5, name: 'FINAL FORM', tone: '超越存在・叙事詩的' };
    if (count >= 40) return { num: 4, name: 'CONCEPT', tone: '抽象・幾何学' };
    if (count >= 20) return { num: 3, name: 'BIASED', tone: '誇張・属性強調' };
    if (count >= 8)  return { num: 2, name: 'AWAKENED', tone: '目に光・ドラマチック' };
    return { num: 1, name: 'HUMAN', tone: '自然なポートレート' };
  },

  getNextStageThreshold() {
    const count = this._state.totalInputCount;
    if (count >= 70) return null;
    if (count >= 40) return 70;
    if (count >= 20) return 40;
    if (count >= 8)  return 20;
    return 8;
  },

  getExhibitionDay() {
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(CONFIG.EXHIBITION_START);
    const current = new Date(today);
    const diff = Math.floor((current - start) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 0;
    if (diff > 2) return 3;
    return diff + 1;
  },

  applyStatChanges(changes) {
    const stats = this._state.stats;
    for (const [key, delta] of Object.entries(changes)) {
      if (stats[key] !== undefined) {
        stats[key] = Math.max(1, Math.min(99, stats[key] + delta));
      }
    }
    this.save();
  },

  addEntry(text, aiResponse) {
    this._state.entries.push({
      text,
      timestamp: Date.now(),
      response: aiResponse,
    });
    this._state.totalInputCount++;
    this.save();
  },

  addTraits(newTraits) {
    for (const t of newTraits) {
      if (this._state.traits.length >= 12) break;
      if (!this._state.traits.includes(t)) {
        this._state.traits.push(t);
      }
    }
    this.save();
  },

  setEpithet(epithet) {
    if (epithet) {
      this._state.epithet = epithet;
      this.save();
    }
  },

  addChangeRecord(record) {
    this._state.changeHistory.unshift({
      ...record,
      timestamp: Date.now(),
    });
    // 最新50件のみ保持
    if (this._state.changeHistory.length > 50) {
      this._state.changeHistory = this._state.changeHistory.slice(0, 50);
    }
    this.save();
  },

  setImage(b64) {
    this._state.imageB64 = b64;
    this.save();
  },

  addBattleRecord(record) {
    this._state.battleHistory.unshift(record);
    this._state.lastBattleTime = Date.now();
    if (this._state.battleHistory.length > 20) {
      this._state.battleHistory = this._state.battleHistory.slice(0, 20);
    }
    this.save();
  },

  getJob() {
    const s = this._state.stats;
    const ranked = Object.entries(s).sort((a, b) => b[1] - a[1]);
    const top1 = ranked[0][0];
    const top2 = ranked[1][0];
    const topVal = ranked[0][1];
    const secondVal = ranked[1][1];

    // 上位2つが近い場合は複合職
    const isCombo = (topVal - secondVal) <= 8;
    const pair = [top1, top2].sort().join('+');

    // 複合職
    const COMBO_JOBS = {
      'AGI+STR': { name: 'ぶとうか', desc: 'けんとあしわざのたつじん' },
      'STR+WIS': { name: 'パラディン', desc: 'せいなるちからのまもりて' },
      'AGI+INT': { name: 'にんじゃ', desc: 'かげにひそむもの' },
      'INT+WIS': { name: 'けんじゃ', desc: 'しんりをきわめしもの' },
      'CHA+STR': { name: 'バトルマスター', desc: 'たたかいをきわめしもの' },
      'CHA+INT': { name: 'スーパースター', desc: 'みんなのあこがれ' },
      'CHA+LCK': { name: 'ゆうしゃ', desc: 'せかいをすくうもの' },
      'AGI+LCK': { name: 'かいぞく', desc: 'じゆうなるぼうけんしゃ' },
      'INT+LCK': { name: 'てんさい', desc: 'うんめいにあいされしもの' },
      'LCK+STR': { name: 'ギャンブラー', desc: 'いちかばちかのしょうぶし' },
      'AGI+CHA': { name: 'おどりこ', desc: 'まいでひとをみりょうする' },
      'LCK+WIS': { name: 'ほしよみ', desc: 'うんめいをよみとくもの' },
      'CHA+WIS': { name: 'しんかんし', desc: 'ひとのこころをいやす' },
      'AGI+WIS': { name: 'レンジャー', desc: 'しぜんとともにいきる' },
      'STR+INT': { name: 'まけんし', desc: 'けんとまほうのつかいて' },
    };

    // 単独職
    const SOLO_JOBS = {
      STR: { name: 'せんし', desc: 'ちからこそすべて' },
      INT: { name: 'まほうつかい', desc: 'ちしきのたんきゅうしゃ' },
      AGI: { name: 'とうぞく', desc: 'すばやさがじまん' },
      CHA: { name: 'しょうにん', desc: 'ひとをひきつけるもの' },
      WIS: { name: 'そうりょ', desc: 'いのりのちからをもつ' },
      LCK: { name: 'あそびにん', desc: 'うんにみちびかれしもの' },
    };

    if (isCombo && COMBO_JOBS[pair]) {
      return COMBO_JOBS[pair];
    }
    return SOLO_JOBS[top1] || { name: 'たびびと', desc: 'まだみぬせかいへ' };
  },

  reset() {
    this._state = { ...DEFAULT_STATE };
    this.save();
  },
};
