/**
 * 音声認識サーバの設定
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Gemini API設定
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash-exp',
    responseModalities: ['AUDIO', 'TEXT'], // 音声+テキスト両方
  },

  // WebSocketサーバ設定
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  // ウェイクワード設定
  wakeWord: {
    keywords: ['gemini', 'ジェミニ', 'hey gemini'],
    enabled: true,
    caseSensitive: false,
  },

  // 音声設定
  audio: {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    encoding: 'pcm',
    mimeType: 'audio/pcm;rate=16000',
  },

  // システムプロンプト
  systemInstruction: `あなたは親切で有能な音声アシスタントです。
以下のガイドラインに従ってください：
1. 簡潔で分かりやすい回答を心がける
2. ユーザーが質問した内容に正確に答える
3. 必要に応じてツールを使用して情報を取得する
4. 自然な会話を心がける`,

  // ログ設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableDebug: process.env.DEBUG === 'true',
  },
};

// 設定の検証
export function validateConfig() {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  console.log('✓ Configuration validated successfully');
}
