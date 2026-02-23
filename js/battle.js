// AOTA.EXE - Battle System
const ENEMIES = [
  { name: 'THE ALGORITHM', baseHP: 60, baseATK: 12, desc: 'アルゴリズムが襲いかかる！' },
  { name: 'UNKNOWN USER', baseHP: 45, baseATK: 10, desc: '見知らぬユーザーが現れた！' },
  { name: 'SOCIAL PRESSURE', baseHP: 70, baseATK: 14, desc: '社会的圧力が立ちはだかる！' },
  { name: 'IMPOSTOR.SYS', baseHP: 55, baseATK: 11, desc: 'インポスター症候群が発動した！' },
  { name: 'THE VOID', baseHP: 80, baseATK: 15, desc: '虚無が広がっていく…' },
  { name: 'AVERAGE OPINION', baseHP: 50, baseATK: 9, desc: '平均的意見の群れが押し寄せる！' },
  { name: 'EXPECTATION', baseHP: 65, baseATK: 13, desc: '期待という名の重圧が！' },
  { name: 'COLLECTIVE_DOUBT', baseHP: 75, baseATK: 14, desc: '集合的疑念が渦巻く！' },
  { name: 'STATUS_QUO', baseHP: 85, baseATK: 16, desc: '現状維持の壁が立ちふさがる！' },
];

const BattleSystem = {
  _timer: null,
  _battleInProgress: false,

  init() {
    this._scheduleBattle();
    this._checkStartupBattle();
  },

  _checkStartupBattle() {
    const state = GameState.get();
    if (state.totalInputCount === 0) return;

    const lastBattle = state.lastBattleTime;
    if (!lastBattle) {
      // 一度もバトルしていない場合、20秒後に発動
      setTimeout(() => this.triggerBattle(), CONFIG.BATTLE_STARTUP_DELAY_MS);
      return;
    }

    const elapsed = Date.now() - lastBattle;
    if (elapsed >= CONFIG.BATTLE_INTERVAL_MS) {
      setTimeout(() => this.triggerBattle(), CONFIG.BATTLE_STARTUP_DELAY_MS);
    }
  },

  _scheduleBattle() {
    // 毎時0分にバトルをスケジュール
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const msUntilNext = nextHour - now;

    this._timer = setTimeout(() => {
      this.triggerBattle();
      // 以降1時間ごとに繰り返す
      this._timer = setInterval(() => this.triggerBattle(), CONFIG.BATTLE_INTERVAL_MS);
    }, msUntilNext);
  },

  getTimeUntilNextBattle() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    return nextHour - now;
  },

  async triggerBattle() {
    const state = GameState.get();
    if (state.totalInputCount === 0) return;
    if (this._battleInProgress) return;

    this._battleInProgress = true;

    try {
      const enemy = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
      const result = this._executeBattle(state, enemy);

      // ステータス反映
      if (result.won) {
        GameState.applyStatChanges({ LCK: 2, STR: 1 });
      } else {
        GameState.applyStatChanges({ WIS: 3 });
      }

      GameState.addBattleRecord({
        enemy: enemy.name,
        won: result.won,
        rounds: result.rounds,
        log: result.log,
        timestamp: Date.now(),
      });

      // UIに通知（main.jsのイベントリスナーが拾う）
      window.dispatchEvent(new CustomEvent('battle-complete', { detail: result }));
    } finally {
      this._battleInProgress = false;
    }
  },

  _executeBattle(state, enemy) {
    const stats = state.stats;
    const inputCount = state.totalInputCount;

    // プレイヤー計算
    const playerMaxHP = Math.floor(50 + stats.STR * 0.5 + inputCount * 1.5);
    const playerATK = stats.STR * 0.4 + stats.AGI * 0.15 + stats.LCK * 0.1;
    const critRate = stats.LCK / 200;
    const dodgeRate = stats.AGI / 300;

    // 敵のスケーリング（ステージに応じて強くなる）
    const stage = GameState.getStage().num;
    const scale = 1 + (stage - 1) * 0.25;
    const enemyMaxHP = Math.floor(enemy.baseHP * scale);
    const enemyATK = Math.floor(enemy.baseATK * scale);

    let playerHP = playerMaxHP;
    let enemyHP = enemyMaxHP;
    const log = [];
    let rounds = 0;

    log.push({ type: 'appear', text: enemy.desc });
    log.push({ type: 'info', text: `${enemy.name}  HP:${enemyHP}` });

    const MAX_ROUNDS = 12;

    while (playerHP > 0 && enemyHP > 0 && rounds < MAX_ROUNDS) {
      rounds++;

      // プレイヤーの攻撃
      const isCrit = Math.random() < critRate;
      let dmg = Math.floor(playerATK * (0.8 + Math.random() * 0.4));
      if (isCrit) {
        dmg = Math.floor(dmg * 1.8);
        log.push({ type: 'crit', text: `かいしんの いちげき！ ${dmg}のダメージ！` });
      } else {
        log.push({ type: 'attack', text: `AOTAのこうげき！ ${dmg}のダメージ！` });
      }
      enemyHP = Math.max(0, enemyHP - dmg);

      if (enemyHP <= 0) {
        log.push({ type: 'defeat', text: `${enemy.name}をたおした！` });
        break;
      }

      // 敵の攻撃
      const isDodge = Math.random() < dodgeRate;
      if (isDodge) {
        log.push({ type: 'dodge', text: 'AOTAはひらりとみをかわした！' });
      } else {
        const eDmg = Math.floor(enemyATK * (0.8 + Math.random() * 0.4));
        playerHP = Math.max(0, playerHP - eDmg);
        log.push({ type: 'enemy-attack', text: `${enemy.name}のこうげき！ ${eDmg}のダメージ！` });
      }

      if (playerHP <= 0) {
        log.push({ type: 'lose', text: 'AOTAはたおれてしまった…' });
        break;
      }
    }

    if (rounds >= MAX_ROUNDS && playerHP > 0 && enemyHP > 0) {
      // 引き分け → 勝利扱い
      log.push({ type: 'draw', text: `${enemy.name}は逃げ出した！` });
    }

    const won = enemyHP <= 0 || (rounds >= MAX_ROUNDS && playerHP > 0);

    if (won) {
      log.push({ type: 'result', text: 'たたかいに しょうりした！' });
      log.push({ type: 'bonus', text: 'LCK+2 STR+1 を獲得！' });
    } else {
      log.push({ type: 'result', text: 'たたかいに やぶれた…' });
      log.push({ type: 'bonus', text: 'WIS+3 を獲得（経験は力なり）' });
    }

    return {
      enemy: enemy.name,
      won,
      rounds,
      log,
      playerHP,
      playerMaxHP,
      enemyHP: Math.max(0, enemyHP),
      enemyMaxHP,
    };
  },
};
