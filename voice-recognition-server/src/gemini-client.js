/**
 * Gemini Live APIクライアント
 * 音声ストリーミングとツール実行を管理
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';
import { getToolDefinitions, executeTools } from './tools/index.js';
import WakeWordDetector from './wake-word-detector.js';

export class GeminiLiveClient {
  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = null;
    this.chat = null;
    this.wakeWordDetector = new WakeWordDetector();
    this.isProcessing = false;
    this.conversationHistory = [];
  }

  /**
   * セッションを初期化
   */
  async initialize() {
    console.log('🚀 Gemini Live APIクライアントを初期化中...');

    try {
      // ツール定義を取得
      const tools = getToolDefinitions();

      // モデルを取得
      this.model = this.genAI.getGenerativeModel({
        model: config.gemini.model,
        tools: tools,
        systemInstruction: config.systemInstruction,
      });

      // チャットセッションを開始
      this.chat = this.model.startChat({
        history: this.conversationHistory,
      });

      console.log('✓ Gemini Live APIクライアント初期化完了');
      return true;
    } catch (error) {
      console.error('❌ 初期化エラー:', error);
      throw error;
    }
  }

  /**
   * テキストメッセージを処理（ストリーミング）
   * @param {string} text - ユーザーメッセージ
   * @param {Function} onChunk - チャンクを受信したときのコールバック
   * @param {Function} onComplete - 完了時のコールバック
   */
  async processText(text, onChunk, onComplete) {
    if (this.isProcessing) {
      console.log('⚠️ 既に処理中です');
      return;
    }

    try {
      this.isProcessing = true;

      // ウェイクワード検知
      const hasWakeWord = this.wakeWordDetector.detect(text);
      if (!hasWakeWord) {
        console.log('🔇 ウェイクワードが検出されませんでした');
        this.isProcessing = false;
        return;
      }

      // ウェイクワードを除去
      const cleanText = this.wakeWordDetector.removeWakeWord(text);
      console.log(`📝 処理するテキスト: "${cleanText}"`);

      // メッセージを送信（ストリーミング）
      const result = await this.chat.sendMessageStream(cleanText);

      let fullText = '';
      const functionCalls = [];

      // ストリーム応答を受信
      console.log('📡 ストリーム応答受信中...');
      for await (const chunk of result.stream) {
        const candidates = chunk.candidates;

        if (candidates && candidates.length > 0) {
          const content = candidates[0].content;

          if (content && content.parts) {
            for (const part of content.parts) {
              // テキスト応答
              if (part.text) {
                fullText += part.text;
                if (onChunk) {
                  onChunk({ type: 'text', data: part.text });
                }
              }

              // ツール呼び出し
              if (part.functionCall) {
                functionCalls.push(part.functionCall);
                if (onChunk) {
                  onChunk({ type: 'function_call', data: part.functionCall });
                }
              }
            }
          }
        }
      }

      // ストリーム完了を待つ
      await result.response;
      console.log('✓ ストリーム応答受信完了');

      // ツール実行
      if (functionCalls.length > 0) {
        console.log(`\n🔧 ${functionCalls.length}個のツールを実行中...`);

        // ツールを実行
        const toolResults = await executeTools(functionCalls);

        if (onChunk) {
          onChunk({ type: 'tool_results', data: toolResults });
        }

        // ツール実行結果を送信して最終応答を取得
        console.log('📡 最終応答を取得中...');
        const finalResult = await this.chat.sendMessageStream(toolResults);

        let finalText = '';

        for await (const chunk of finalResult.stream) {
          const candidates = chunk.candidates;

          if (candidates && candidates.length > 0) {
            const content = candidates[0].content;

            if (content && content.parts) {
              for (const part of content.parts) {
                if (part.text) {
                  finalText += part.text;
                  if (onChunk) {
                    onChunk({ type: 'final_text', data: part.text });
                  }
                }
              }
            }
          }
        }

        await finalResult.response;
        console.log('✓ 最終応答受信完了');

        if (onComplete) {
          onComplete({ text: finalText, hadToolCalls: true });
        }
      } else {
        // ツール呼び出しなし
        if (onComplete) {
          onComplete({ text: fullText, hadToolCalls: false });
        }
      }
    } catch (error) {
      console.error('❌ テキスト処理エラー:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 音声データを処理
   * 注意: 現在の@google/generative-aiは音声ストリーミング非対応のため、
   * まずテキストに変換してから処理する必要があります
   * @param {Buffer} audioData - 音声データ
   * @param {Function} onChunk - チャンクを受信したときのコールバック
   * @param {Function} onComplete - 完了時のコールバック
   */
  async processAudio(audioData, onChunk, onComplete) {
    console.log('🎤 音声データ処理（未実装）');
    console.log('⚠️ 現在のSDKバージョンでは、音声ストリーミングはサポートされていません');
    console.log('💡 クライアント側で音声認識（Web Speech API）を使用してテキストに変換してください');

    // 代替案: クライアント側でWeb Speech APIを使って音声をテキストに変換し、
    // テキストとして送信する
  }

  /**
   * チャット履歴をクリア
   */
  clearHistory() {
    this.conversationHistory = [];
    if (this.chat) {
      this.chat = this.model.startChat({
        history: [],
      });
    }
    console.log('🗑️ チャット履歴をクリアしました');
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return {
      isProcessing: this.isProcessing,
      historyLength: this.conversationHistory.length,
      wakeWordEnabled: this.wakeWordDetector.enabled,
    };
  }
}

export default GeminiLiveClient;
