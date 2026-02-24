// AOTA.EXE - Gemini API Integration
const GeminiAPI = {
  _referenceImageB64: null,

  _getApiKey() {
    return CONFIG.GEMINI_API_KEY || sessionStorage.getItem('gemini_api_key') || '';
  },

  async loadReferenceImage() {
    if (this._referenceImageB64) return this._referenceImageB64;
    try {
      const res = await fetch(CONFIG.REFERENCE_IMAGE_PATH);
      if (!res.ok) throw new Error(`Failed to load reference image: ${res.status}`);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // data:image/jpeg;base64,XXXX から base64 部分のみ取得
          this._referenceImageB64 = reader.result.split(',')[1];
          console.log('[AOTA] Reference image loaded');
          resolve(this._referenceImageB64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[AOTA] Reference image not found, proceeding without it:', e.message);
      return null;
    }
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
5. imagePromptHint: レトロRPGピクセルアートの雰囲気ヒント（英語、15語以内）。キャラの装備・オーラ・表情・背景エフェクトなどを具体的に。例: "wearing iron armor, confident smile, blue aura", "wizard robe, glowing staff, mysterious"

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
        imagePromptHint: 'simple villager clothes, neutral expression',
      };
    }
  },

  async generateImage(state, imagePromptHint) {
    const apiKey = this._getApiKey();
    if (!apiKey) throw new Error('API key not set');

    const stage = GameState.getStage();
    const traits = state.traits.slice(0, 6).join(', ');

    // ステージ別のビジュアル指示（レトロゲーム進化）
    const stageVisuals = {
      1: '8-bit NES/Famicom era pixel art. Very limited color palette (4-8 colors). Simple blocky pixels, minimal detail. Like an early Dragon Quest or Final Fantasy I character sprite portrait.',
      2: '16-bit SNES/Super Famicom era pixel art. Richer colors (16-32 colors), more defined features. Dramatic shading, eyes have visible highlights. Like Chrono Trigger or Final Fantasy VI character art.',
      3: '32-bit era pixel art with exaggerated features. Vibrant saturated palette, bold outlines. Character traits strongly emphasized in visual design. Like a PlayStation-era RPG character select screen.',
      4: 'High-detail pixel art with abstract geometric elements. Glitch effects, data-like patterns weaving through the figure. Otherworldly aura. Like a hidden boss in a retro RPG.',
      5: 'Ultimate pixel art masterpiece. Golden/cosmic aura radiating outward. Legendary final form. Rich detail while maintaining pixel aesthetic. Like the final boss reveal in a classic JRPG.',
    };

    const prompt = `Convert the reference photo into a retro JRPG pixel art character portrait.
Preserve the person's recognizable facial features but render entirely in pixel art style.
DO NOT generate a realistic or photographic image. The output MUST look like pixel art from a retro video game.

Style: ${stageVisuals[stage.num] || stageVisuals[1]}
Character traits: ${traits || 'ordinary person'}
Title: ${state.epithet || 'none'}
Visual mood: ${imagePromptHint}

DO NOT include any text, letters, words, numbers, labels, titles, or watermarks anywhere in the image.

Black or very dark background. Square format, bust-up composition, single character facing slightly left.
Visible individual pixels. No anti-aliasing. Crisp pixel edges.`;

    // リクエストパーツを構築（参照画像があれば含める）
    const requestParts = [];
    const refImage = await this.loadReferenceImage();
    if (refImage) {
      requestParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: refImage,
        },
      });
    }
    requestParts.push({ text: prompt });

    const url = `${CONFIG.GEMINI_API_BASE}/${CONFIG.GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
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

  async generateEnemyImage(enemyName, stageNum) {
    const apiKey = this._getApiKey();
    if (!apiKey) throw new Error('API key not set');

    const stageVisuals = {
      1: '8-bit NES/Famicom era pixel art. Very limited color palette (4-8 colors). Simple blocky pixels.',
      2: '16-bit SNES/Super Famicom era pixel art. Richer colors (16-32 colors), more defined features.',
      3: '32-bit era pixel art. Vibrant saturated palette, bold outlines.',
      4: 'High-detail pixel art with glitch effects and data-like patterns.',
      5: 'Ultimate pixel art masterpiece. Cosmic/otherworldly aura.',
    };

    const prompt = `Generate a retro JRPG monster/enemy portrait in pixel art style.
This enemy represents the abstract concept "${enemyName}".
Interpret this concept as a creative fantasy monster or dark entity. Be imaginative and menacing.

Style: ${stageVisuals[stageNum] || stageVisuals[1]}

DO NOT include any text, letters, words, numbers, labels, titles, or watermarks anywhere in the image.

Black or very dark background. Square format. Single creature/entity centered.
Visible individual pixels. No anti-aliasing. Crisp pixel edges.`;

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
        return part.inlineData.data;
      }
    }

    throw new Error('No enemy image returned from API');
  },
};
