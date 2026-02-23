// AOTA.EXE - Gemini API Integration
const GeminiAPI = {
  _getApiKey() {
    return CONFIG.GEMINI_API_KEY || sessionStorage.getItem('gemini_api_key') || '';
  },

  async analyzeInput(userText, currentState) {
    const apiKey = this._getApiKey();
    if (!apiKey) throw new Error('API key not set');

    const stage = GameState.getStage();
    const prompt = `あなたはRPGゲームのマスターAIです。
来場者がキャラクター「青田 努」について以下の印象・評価・想像を入力しました：

「${userText}」

現在のステータス：
STR:${currentState.stats.STR} INT:${currentState.stats.INT} AGI:${currentState.stats.AGI} CHA:${currentState.stats.CHA} WIS:${currentState.stats.WIS} LCK:${currentState.stats.LCK}

現在のステージ：${stage.num} (${stage.name})
現在の特性：${currentState.traits.join(', ') || 'なし'}
現在の称号：${currentState.epithet || 'なし'}
累計入力数：${currentState.totalInputCount}

以下のルールに従ってJSON形式で返答してください：
1. statChanges: 各ステータスの変動値（-5〜+10の整数）。ポジティブな入力→CHA/LCK上昇傾向、ネガティブな入力→STR/INT上昇傾向。入力内容に関連するステータスをより大きく変動させる。
2. newTraits: 入力から連想される新しい特性（4文字以内、1〜2個）。既存特性と重複しないこと。
3. epithet: 現在の状態を反映した称号（10文字以内）。前回と同じでもよい。
4. narrative: 世界観テキスト（ドラクエ風のナレーション、40文字以内）。
5. imagePromptHint: キャラクター画像生成のためのヒント（英語、20語以内）。ステージ${stage.num}のトーン「${stage.tone}」を反映すること。

JSONのみを返してください。マークダウンのコードブロックは使わないでください。

{
  "statChanges": {"STR":0,"INT":0,"AGI":0,"CHA":0,"WIS":0,"LCK":0},
  "newTraits": [],
  "epithet": "",
  "narrative": "",
  "imagePromptHint": ""
}`;

    const url = `${CONFIG.GEMINI_API_BASE}/${CONFIG.GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini Text API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSONを抽出（コードブロックが含まれている場合も対処）
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', text);
      // フォールバック：最小限の変動を返す
      return {
        statChanges: { STR: 1, INT: 1, AGI: 1, CHA: 1, WIS: 1, LCK: 1 },
        newTraits: [],
        epithet: currentState.epithet || '旅人',
        narrative: 'なにかが変わった気がする…',
        imagePromptHint: 'portrait of a Japanese man',
      };
    }
  },

  async generateImage(state, imagePromptHint) {
    const apiKey = this._getApiKey();
    if (!apiKey) throw new Error('API key not set');

    const stage = GameState.getStage();
    const traits = state.traits.slice(0, 6).join(', ');

    const prompt = `Generate a character portrait image.
Subject: A Japanese man named "Aota Tsutomu", age around 40.
Stage ${stage.num} "${stage.name}": ${stage.tone}
Visual hint: ${imagePromptHint}
Traits: ${traits || 'ordinary person'}
Stats - STR:${state.stats.STR} INT:${state.stats.INT} AGI:${state.stats.AGI} CHA:${state.stats.CHA} WIS:${state.stats.WIS} LCK:${state.stats.LCK}
Title: ${state.epithet || 'none'}

Style: RPG character portrait, dramatic lighting, fantasy art style.
${stage.num >= 4 ? 'Abstract, geometric, transcendent being.' : ''}
${stage.num >= 5 ? 'Epic, godlike, cosmic energy, final form.' : ''}
Square format, centered composition.`;

    const url = `${CONFIG.GEMINI_API_BASE}/${CONFIG.GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini Image API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData) {
        return part.inlineData.data; // base64
      }
    }

    throw new Error('No image returned from API');
  },
};
