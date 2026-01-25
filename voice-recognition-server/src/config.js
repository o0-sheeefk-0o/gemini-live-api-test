/**
 * 音声認識サーバの設定
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Gemini API設定
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    // 音声対応モデル
    model: 'gemini-2.0-flash-exp',
    // 音声名（Aoede, Charon, Fenrir, Kore, Puck など）
    voiceName: process.env.GEMINI_VOICE_NAME || 'Aoede',
  },

  // WebSocketサーバ設定
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  // 音声設定
  audio: {
    // 入力音声（クライアント→サーバ→Gemini）
    inputSampleRate: 16000,
    // 出力音声（Gemini→サーバ→クライアント）
    outputSampleRate: 24000,
    // 共通設定
    channels: 1,
    bitDepth: 16,
    encoding: 'pcm',
  },

  // システムプロンプト
  systemInstruction: `あなたは車両制御対応の音声アシスタントです。
以下のガイドラインに従ってください：
1. 簡潔で分かりやすい回答を心がける
2. ユーザーが質問した内容に正確に答える
3. 必要に応じてツールを使用して情報を取得する
4. 自然な会話を心がける
5. 日本語で応答する
6. 車両状態の情報が送られてきた場合は、サイレントに記憶するだけで応答は不要です
7. ユーザーから車両に関する質問があった場合のみ、記憶している車両状態を参照して回答してください`,

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
