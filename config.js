// AOTA.EXE - Configuration
// このファイルは .gitignore に追加してください
const CONFIG = {
  GEMINI_API_KEY: '',  // ここにAPIキーを設定、または sessionStorage 経由で渡す
  GEMINI_TEXT_MODEL: 'gemini-2.0-flash',
  GEMINI_IMAGE_MODEL: 'gemini-2.5-flash-image',
  GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  EXHIBITION_START: '2025-03-06',
  EXHIBITION_END: '2025-03-08',
  EXHIBITION_HOURS: { start: 12, end: 19 },
  MAX_INPUT_LENGTH: 60,
  BATTLE_INTERVAL_MS: 60 * 60 * 1000, // 1時間
  BATTLE_STARTUP_DELAY_MS: 20 * 1000,  // 起動時20秒後
  IMAGE_GENERATION_INTERVAL: 5,         // 何回入力ごとに画像生成するか
};
