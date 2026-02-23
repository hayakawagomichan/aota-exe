// AOTA.EXE - Main Controller
const App = {
  _isProcessing: false,
  _battleTimerInterval: null,
  _typewriterQueue: [],
  _typewriterActive: false,

  async init() {
    GameState.init();
    Audio8bit.init();

    this._checkApiKey();
    this._bindEvents();
    this._render();
    this._startBattleTimer();

    BattleSystem.init();
  },

  // --- APIキー管理 ---
  _checkApiKey() {
    const key = CONFIG.GEMINI_API_KEY || sessionStorage.getItem('gemini_api_key');
    if (!key) {
      document.getElementById('apikey-modal').classList.add('active');
    }
  },

  _submitApiKey() {
    const input = document.getElementById('apikey-input');
    const key = input.value.trim();
    if (key) {
      sessionStorage.setItem('gemini_api_key', key);
      document.getElementById('apikey-modal').classList.remove('active');
      Audio8bit.confirm();
    }
  },

  // --- イベントバインド ---
  _bindEvents() {
    // APIキー送信
    document.getElementById('apikey-submit').addEventListener('click', () => this._submitApiKey());
    document.getElementById('apikey-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitApiKey();
    });

    // 入力送信
    document.getElementById('submit-btn').addEventListener('click', () => this._handleSubmit());
    document.getElementById('user-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) this._handleSubmit();
    });

    // 文字数カウント
    document.getElementById('user-input').addEventListener('input', (e) => {
      const len = e.target.value.length;
      const counter = document.getElementById('char-count');
      counter.textContent = `${len}/${CONFIG.MAX_INPUT_LENGTH}`;
      if (len > CONFIG.MAX_INPUT_LENGTH) {
        counter.style.color = 'var(--hp-red)';
      } else {
        counter.style.color = 'var(--text-dim)';
      }
    });

    // サウンドトグル
    document.getElementById('sound-toggle').addEventListener('click', () => {
      const on = Audio8bit.toggle();
      document.getElementById('sound-toggle').textContent = on ? 'SND:ON' : 'SND:OFF';
    });

    // バトルイベント
    window.addEventListener('battle-complete', (e) => this._showBattle(e.detail));

    // バトルオーバーレイクリックで閉じる
    document.getElementById('battle-overlay').addEventListener('click', () => {
      document.getElementById('battle-overlay').classList.remove('active');
    });
  },

  // --- 入力処理 ---
  async _handleSubmit() {
    if (this._isProcessing) return;

    const input = document.getElementById('user-input');
    const text = input.value.trim();

    if (!text) return;
    if (text.length > CONFIG.MAX_INPUT_LENGTH) {
      Audio8bit.error();
      return;
    }

    const apiKey = CONFIG.GEMINI_API_KEY || sessionStorage.getItem('gemini_api_key');
    if (!apiKey) {
      document.getElementById('apikey-modal').classList.add('active');
      return;
    }

    this._isProcessing = true;
    document.body.classList.add('processing');
    document.getElementById('submit-btn').disabled = true;
    document.getElementById('submit-btn').textContent = '...';
    this._showLoading(true);

    Audio8bit.confirm();
    input.value = '';
    document.getElementById('char-count').textContent = `0/${CONFIG.MAX_INPUT_LENGTH}`;

    const prevStage = GameState.getStage().num;
    const state = GameState.get();

    try {
      // 1. テキスト解析
      const aiResult = await GeminiAPI.analyzeInput(text, state);

      // 2. ステータス適用
      const prevStats = { ...state.stats };
      GameState.applyStatChanges(aiResult.statChanges || {});
      GameState.addTraits(aiResult.newTraits || []);
      GameState.setEpithet(aiResult.epithet);
      GameState.addEntry(text, aiResult);

      // 変更履歴
      GameState.addChangeRecord({
        input: text,
        statChanges: aiResult.statChanges,
        newTraits: aiResult.newTraits,
        narrative: aiResult.narrative,
      });

      // ステータス変動音
      const totalChange = Object.values(aiResult.statChanges || {}).reduce((a, b) => a + b, 0);
      if (totalChange > 0) Audio8bit.statUp();
      else if (totalChange < 0) Audio8bit.statDown();

      // ステージアップチェック
      const newStage = GameState.getStage().num;
      if (newStage > prevStage) {
        Audio8bit.evolve();
      }

      // UI更新
      this._render();
      this._showStatChanges(aiResult.statChanges || {});
      this._typewrite('narrative-text', aiResult.narrative || '……');
      this._addLogEntry(text, aiResult);

      // 3. 画像生成（N回ごと、非同期・UIはブロックしない）
      const interval = CONFIG.IMAGE_GENERATION_INTERVAL || 5;
      const shouldGenImage = !state.imageB64
        || state.totalInputCount % interval === 0
        || state.totalInputCount === 1;
      console.log(`[AOTA] inputCount=${state.totalInputCount}, interval=${interval}, generateImage=${shouldGenImage}`);
      if (shouldGenImage) {
        this._generateImageAsync(aiResult.imagePromptHint);
      }

    } catch (err) {
      console.error('Processing error:', err);
      Audio8bit.error();
      this._typewrite('narrative-text', 'エラーが発生した… もう一度試してみよう。');
      this._addLogEntry(text, null, err.message);
    } finally {
      this._isProcessing = false;
      document.body.classList.remove('processing');
      document.getElementById('submit-btn').disabled = false;
      document.getElementById('submit-btn').textContent = 'けってい';
      this._showLoading(false);
      // 入力欄にフォーカスを戻す
      document.getElementById('user-input').focus();
    }
  },

  async _generateImageAsync(hint) {
    const area = document.getElementById('char-image-area');
    const prevHtml = area.innerHTML;
    // 生成中表示
    area.innerHTML = `<div class="placeholder">がぞうせいせいちゅう...</div>`;
    area.querySelector('.placeholder').style.animation = 'blink 0.8s step-end infinite';

    try {
      const state = GameState.get();
      const b64 = await GeminiAPI.generateImage(state, hint || 'portrait of a Japanese man');
      GameState.setImage(b64);
      this._renderCharImage();
    } catch (err) {
      console.error('Image generation error:', err);
      // エラー時は前の画像を戻すか、エラー表示
      if (GameState.get().imageB64) {
        this._renderCharImage();
      } else {
        area.innerHTML = `<div class="placeholder">がぞうせいせい しっぱい…<br><span style="font-size:7px;color:var(--hp-red)">${err.message?.slice(0, 60) || 'ERROR'}</span></div>`;
      }
    }
  },

  // --- レンダリング ---
  _render() {
    const state = GameState.get();
    const stage = GameState.getStage();
    const day = GameState.getExhibitionDay();

    // ヘッダー
    document.getElementById('entry-count').textContent = state.totalInputCount;
    document.getElementById('day-display').textContent = day > 0 ? `DAY${day}` : 'STANDBY';

    // キャラクター情報
    document.getElementById('char-epithet').textContent = state.epithet || '---';
    document.getElementById('char-stage').textContent = `STAGE ${stage.num} : ${stage.name}`;

    // 職業
    const job = GameState.getJob();
    const jobEl = document.getElementById('char-job');
    if (jobEl) {
      jobEl.querySelector('.job-name').textContent = job.name;
      jobEl.querySelector('.job-desc').textContent = job.desc;
    }

    // ステータス
    this._renderStats(state.stats);

    // 特性
    this._renderTraits(state.traits);

    // キャラクター画像
    this._renderCharImage();

    // 進化バー
    this._renderEvoBar(state.totalInputCount);

    // フッター
    this._updateBattleTimer();
  },

  _renderStats(stats) {
    const order = ['STR', 'INT', 'AGI', 'CHA', 'WIS', 'LCK'];
    for (const key of order) {
      const val = stats[key];
      const el = document.getElementById(`stat-${key}`);
      if (el) {
        el.querySelector('.stat-value').textContent = val;
        el.querySelector('.stat-bar-fill').style.width = `${(val / 99) * 100}%`;
      }
    }
  },

  _showStatChanges(changes) {
    for (const [key, delta] of Object.entries(changes)) {
      const el = document.getElementById(`stat-${key}`);
      if (!el) continue;
      const changeEl = el.querySelector('.stat-change');
      const barFill = el.querySelector('.stat-bar-fill');

      if (delta > 0) {
        changeEl.textContent = `+${delta}`;
        changeEl.className = 'stat-change up';
        barFill.classList.add('bar-up');
      } else if (delta < 0) {
        changeEl.textContent = `${delta}`;
        changeEl.className = 'stat-change down';
        barFill.classList.add('bar-down');
      } else {
        changeEl.textContent = '';
        changeEl.className = 'stat-change';
      }
      el.classList.add('stat-flash');
      setTimeout(() => {
        el.classList.remove('stat-flash');
        changeEl.textContent = '';
        changeEl.className = 'stat-change';
        barFill.classList.remove('bar-up', 'bar-down');
      }, 4000);
    }
  },

  _renderTraits(traits) {
    const area = document.getElementById('traits-area');
    area.innerHTML = '';
    for (const t of traits) {
      const tag = document.createElement('span');
      tag.className = 'trait-tag';
      tag.textContent = t;
      area.appendChild(tag);
    }
  },

  _renderCharImage() {
    const state = GameState.get();
    const area = document.getElementById('char-image-area');

    if (state.imageB64) {
      area.innerHTML = `<img src="data:image/png;base64,${state.imageB64}" alt="AOTA" />`;
    } else {
      area.innerHTML = `<div class="placeholder">AWAITING<br>INPUT...</div>`;
    }
  },

  _renderEvoBar(count) {
    const next = GameState.getNextStageThreshold();
    const stage = GameState.getStage();
    const progressEl = document.getElementById('evo-progress');
    const nextEl = document.getElementById('evo-next');

    if (!next) {
      // 最終段階
      progressEl.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const b = document.createElement('span');
        b.className = 'evo-block filled';
        progressEl.appendChild(b);
      }
      nextEl.textContent = 'MAX';
      return;
    }

    // 現在ステージの開始しきい値
    const thresholds = [0, 8, 20, 40, 70];
    const current = thresholds[stage.num - 1];
    const range = next - current;
    const progress = count - current;
    const ratio = Math.min(1, progress / range);
    const filled = Math.floor(ratio * 10);

    progressEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const b = document.createElement('span');
      b.className = 'evo-block' + (i < filled ? ' filled' : '');
      progressEl.appendChild(b);
    }
    nextEl.textContent = `NEXT:${next}`;
  },

  // --- タイプライター演出 ---
  _typewrite(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = '';
    el.classList.add('cursor-blink');
    let i = 0;

    const tick = () => {
      if (i < text.length) {
        el.textContent += text[i];
        Audio8bit.typeChar();
        i++;
        setTimeout(tick, 50 + Math.random() * 30);
      } else {
        setTimeout(() => el.classList.remove('cursor-blink'), 2000);
      }
    };
    tick();
  },

  // --- ログ ---
  _addLogEntry(input, aiResult, error) {
    const container = document.getElementById('log-entries');
    const entry = document.createElement('div');
    entry.className = 'log-entry fade-in';

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (error) {
      entry.innerHTML = `<span class="log-time">${time}</span><span class="log-text" style="color:var(--hp-red)">ERROR: ${this._escapeHtml(error)}</span>`;
    } else {
      const changes = aiResult?.statChanges || {};
      const changeSummary = Object.entries(changes)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`)
        .join(' ');
      entry.innerHTML = `<span class="log-time">${time}</span><span class="log-text">"${this._escapeHtml(input)}" → ${changeSummary || '---'}</span>`;
    }

    container.insertBefore(entry, container.firstChild);

    // 最大30件
    while (container.children.length > 30) {
      container.removeChild(container.lastChild);
    }
  },

  // --- バトル表示 ---
  async _showBattle(result) {
    Audio8bit.battleStart();

    const overlay = document.getElementById('battle-overlay');
    const log = document.getElementById('battle-log');
    const hpDisplay = document.getElementById('battle-hp-display');

    log.innerHTML = '';
    hpDisplay.innerHTML = `
      <div>AOTA HP: <span id="b-player-hp">${result.playerMaxHP}</span>/${result.playerMaxHP}
        <span class="battle-hp-bar"><span class="battle-hp-fill" id="b-player-hp-bar" style="width:100%"></span></span>
      </div>
      <div>${result.enemy} HP: <span id="b-enemy-hp">${result.enemyMaxHP}</span>/${result.enemyMaxHP}
        <span class="battle-hp-bar"><span class="battle-hp-fill" id="b-enemy-hp-bar" style="width:100%"></span></span>
      </div>
    `;

    overlay.classList.add('active');

    // バトルログを1行ずつ表示
    for (let i = 0; i < result.log.length; i++) {
      const line = result.log[i];
      await this._delay(600);

      const div = document.createElement('div');
      div.className = `battle-line ${line.type}`;
      log.appendChild(div);

      // タイプライター表示
      await this._typewriteElement(div, line.text);

      // 効果音
      switch (line.type) {
        case 'attack': Audio8bit.attack(); break;
        case 'crit': Audio8bit.critical(); break;
        case 'enemy-attack': Audio8bit.damage(); break;
        case 'dodge': Audio8bit.dodge(); break;
        case 'defeat':
        case 'lose': break;
        case 'result':
          if (result.won) Audio8bit.victory();
          else Audio8bit.defeat();
          break;
      }

      log.scrollTop = log.scrollHeight;
    }

    // バトル終了後レンダリング更新
    this._render();

    // ログに記録
    const logContainer = document.getElementById('log-entries');
    const entry = document.createElement('div');
    entry.className = 'log-entry battle fade-in';
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-text">BATTLE vs ${result.enemy} → ${result.won ? 'WIN!' : 'LOSE...'}</span>`;
    logContainer.insertBefore(entry, logContainer.firstChild);
  },

  _typewriteElement(el, text) {
    return new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        if (i < text.length) {
          el.textContent += text[i];
          Audio8bit.typeChar();
          i++;
          setTimeout(tick, 35);
        } else {
          resolve();
        }
      };
      tick();
    });
  },

  // --- バトルタイマー ---
  _startBattleTimer() {
    this._battleTimerInterval = setInterval(() => this._updateBattleTimer(), 1000);
  },

  _updateBattleTimer() {
    const ms = BattleSystem.getTimeUntilNextBattle();
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const el = document.getElementById('battle-timer');
    if (el) {
      el.textContent = `BATTLE: ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
  },

  // --- ユーティリティ ---
  _showLoading(show) {
    const el = document.getElementById('loading-indicator');
    if (el) {
      el.classList.toggle('active', show);
    }
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

// 起動
document.addEventListener('DOMContentLoaded', () => App.init());
