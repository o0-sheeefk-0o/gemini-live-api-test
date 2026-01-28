/**
 * Gemini Live API クライアント（音声ストリーミング対応）
 * @google/genai パッケージを使用
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { config } from "./config.js";
import { getToolDefinitions, executeTools } from "./tools/index.js";

export class GeminiLiveClient {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.session = null;
    this.isConnected = false;
    this.isProcessing = false;
    this.isGenerating = false; // Geminiが応答中かどうか
    this.isExecutingTools = false; // ツール実行中かどうか

    // コールバック
    this.onAudioChunk = null;
    this.onTextChunk = null;
    this.onTranscript = null;
    this.onToolCall = null;
    this.onError = null;
    this.onTurnComplete = null;
    this.onConversationUpdate = null; // 会話履歴が更新されたときのコールバック

    // 音声バッファ
    this.audioBuffer = [];
    this.pendingFunctionCalls = [];

    // トランスクリプトバッファ（チャンクを蓄積）
    this.currentInputTranscript = "";
    this.currentOutputTranscript = "";

    // 会話履歴
    this.conversationHistory = [];
  }

  /**
   * Live APIセッションを開始
   */
  async connect() {
    if (this.isConnected) {
      console.log("⚠️ 既に接続されています");
      return;
    }

    console.log("🚀 Gemini Live API に接続中...");

    try {
      const tools = getToolDefinitions();

      this.session = await this.ai.live.connect({
        model: config.gemini.model,
        config: {
          responseModalities: [Modality.AUDIO],
          // response_modalities: [Modality.AUDIO, Modality.TEXT], // Modality.TEXT を含むと「Request contains an invalid argument」で失敗する(google の修正待ち)
          systemInstruction: config.systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.gemini.voiceName || "Zephyr",
              },
            },
          },
          tools: tools,
          //セッションが長くなったときに、接続が突然終了しないようにする
          contextWindowCompression: {
            triggerTokens: "25600",
            slidingWindow: { targetTokens: "12800" },
          },
        },
        callbacks: {
          onopen: () => {
            console.log("✓ Gemini Live API 接続完了");
            this.isConnected = true;
          },
          onmessage: async (message) => {
            await this._handleMessage(message);
          },
          onerror: (error) => {
            console.error("❌ Gemini Live API エラー:", error);
            if (this.onError) {
              this.onError(error);
            }
          },
          onclose: (event) => {
            console.log("🔌 Gemini Live API 切断:", event?.reason || "unknown");
            this.isConnected = false;
            this.session = null;
          },
        },
      });

      return true;
    } catch (error) {
      console.error("❌ 接続エラー:", error);
      throw error;
    }
  }

  /**
   * Live APIセッションを切断
   */
  async disconnect() {
    if (this.session) {
      try {
        this.session.close();
      } catch (error) {
        console.error("❌ 切断エラー:", error);
      }
      this.session = null;
      this.isConnected = false;
    }
  }

  /**
   * 音声データを送信（リアルタイム入力）
   * @param {Buffer|Uint8Array} audioData - PCM 16bit 16kHz mono 音声データ
   */
  async sendAudio(audioData) {
    if (!this.session || !this.isConnected) {
      console.warn("[sendAudio]⚠️ セッションが接続されていません");
      return;
    }

    try {
      // Geminiが応答中の場合、割り込みを発生させる
      if (this.isGenerating) {
        console.log("⚡ 音声送信中");
        // 割り込みフラグをリセット
        this.isGenerating = false;
        // ツール実行中でなければpendingFunctionCallsをクリア
        if (!this.isExecutingTools) {
          this.pendingFunctionCalls = [];
        }
      }

      // Buffer を base64 に変換
      const base64Audio = Buffer.isBuffer(audioData)
        ? audioData.toString("base64")
        : Buffer.from(audioData).toString("base64");

      await this.session.sendRealtimeInput({
        media: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Audio,
        },
      });
    } catch (error) {
      console.error("❌ 音声送信エラー:", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * テキストメッセージを送信
   * @param {string} text - テキストメッセージ
   * @param {Object} options - オプション
   * @param {boolean} options.expectResponse - 応答を期待するか（デフォルト: true）
   */
  async sendText(text, options = { expectResponse: true }) {
    if (!this.session || !this.isConnected) {
      console.warn("⚠️ セッションが接続されていません");
      return;
    }

    const expectResponse = options.expectResponse !== false;
    console.log(`📝 テキスト送信: "${text}" (応答期待: ${expectResponse})`);

    try {
      await this.session.sendClientContent({
        turns: text,
        turnComplete: expectResponse,
      });
    } catch (error) {
      console.error("❌ テキスト送信エラー:", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * コンテキスト情報を送信（応答なし）
   * 車両状態など、Geminiに認識させたいが応答は不要な情報を送る
   * @param {string} contextInfo - コンテキスト情報
   */
  async sendContext(contextInfo) {
    if (!this.session || !this.isConnected) {
      console.warn("⚠️ セッションが接続されていません");
      return;
    }

    console.log(`📊 コンテキスト送信: "${contextInfo}"`);

    try {
      await this.session.sendClientContent({
        turns: contextInfo,
        turnComplete: false, // 応答を期待しない
      });
    } catch (error) {
      console.error("❌ コンテキスト送信エラー:", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * ツール実行結果を送信
   * @param {Object} functionCall - 元のfunction call
   * @param {any} result - 実行結果
   */
  async sendToolResponse(functionCall, result) {
    if (!this.session || !this.isConnected) {
      console.warn("⚠️ セッションが接続されていません");
      return;
    }

    console.log(`📤 ツール結果送信: ${functionCall.name}`);

    try {
      await this.session.sendToolResponse(
        {
          functionResponses: {
            id: functionCall.id,
            name: functionCall.name,
            response: { result: result },
          },
        },
        { endOfTurn: true },
      );
    } catch (error) {
      console.error("❌ ツール結果送信エラー:", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * メッセージを処理
   * @private
   */
  async _handleMessage(message) {
    // サーバーコンテンツを処理
    if (message.serverContent) {
      const serverContent = message.serverContent;

      // モデルのターン（応答）
      if (serverContent.modelTurn) {
        // Geminiが応答を開始
        this.isGenerating = true;

        const parts = serverContent.modelTurn.parts || [];

        for (const part of parts) {
          // 音声応答
          if (
            part.inlineData &&
            part.inlineData.mimeType?.startsWith("audio/")
          ) {
            const audioData = Buffer.from(part.inlineData.data, "base64");
            if (this.onAudioChunk) {
              this.onAudioChunk(audioData, part.inlineData.mimeType);
            }
          }

          // テキスト応答
          if (part.text) {
            console.log(`💬 テキスト応答: ${part.text}`);
            if (this.onTextChunk) {
              this.onTextChunk(part.text);
            }
          }

          // ツール呼び出し
          if (part.functionCall) {
            console.log(`🔧 ツール呼び出し: ${part.functionCall.name}`);
            this.pendingFunctionCalls.push(part.functionCall);
            if (this.onToolCall) {
              this.onToolCall(part.functionCall);
            }
          }
        }
      }

      // 入力音声のトランスクリプト（チャンクを蓄積）
      if (serverContent.inputTranscription) {
        const chunk = serverContent.inputTranscription.text;
        console.log(`🎤 入力トランスクリプト(chunk): ${chunk}`);
        this.currentInputTranscript += chunk;
        // チャンクは蓄積するだけで、フロントには送らない
      }

      // 出力音声のトランスクリプト（チャンクを蓄積）
      if (serverContent.outputTranscription) {
        const chunk = serverContent.outputTranscription.text;
        console.log(`🔊 出力トランスクリプト(chunk): ${chunk}`);
        this.currentOutputTranscript += chunk;
        // チャンクは蓄積するだけで、フロントには送らない
      }

      // ターン完了
      if (serverContent.turnComplete) {
        console.log("✓ ターン完了");
        this.isGenerating = false; // 応答終了

        // 蓄積したトランスクリプトを会話履歴に追加
        this._finalizeTranscripts();

        await this._processPendingToolCalls();
        if (this.onTurnComplete) {
          this.onTurnComplete();
        }
      }

      // 割り込み検知
      if (serverContent.interrupted) {
        console.log("⚠️ 割り込み検知");
        this.isGenerating = false; // 応答中断
        // this.pendingFunctionCalls = [];
      }
    }

    // ツール呼び出し（別形式）
    if (message.toolCall) {
      console.log(
        `🔧 ツール呼び出し（toolCall形式）: ${JSON.stringify(message)}`,
      );
      for (const functionCall of message.toolCall.functionCalls) {
        this.pendingFunctionCalls.push(functionCall);
        // ツール実行開始
        this.isExecutingTools = true;
      }
      if (this.onToolCall) {
        this.onToolCall(message.toolCall);
      }
    }
  }

  /**
   * トランスクリプトを確定して会話履歴に追加
   * @private
   */
  _finalizeTranscripts() {
    let updated = false;

    // 入力トランスクリプトを会話履歴に追加
    if (this.currentInputTranscript.trim()) {
      // 全てのスペース・改行を削除
      const cleanedContent = this.currentInputTranscript
        .trim()
        .replaceAll(/\s+/g, "");

      const userMessage = {
        role: "user",
        content: cleanedContent,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(userMessage);
      console.log(`📝 会話履歴追加(user): "${userMessage.content}"`);

      // ターン完了時にトランスクリプト全体を送信
      if (this.onTranscript) {
        this.onTranscript(userMessage.content, "input");
      }

      this.currentInputTranscript = "";
      updated = true;
    }

    // 出力トランスクリプトを会話履歴に追加
    if (this.currentOutputTranscript.trim()) {
      // 前後のスペースを削除し、連続するスペースを1つにまとめる
      const cleanedContent = this.currentOutputTranscript
        .trim()
        .replaceAll(/\s+/g, "");

      const assistantMessage = {
        role: "assistant",
        content: cleanedContent,
        timestamp: new Date().toISOString(),
      };
      this.conversationHistory.push(assistantMessage);
      console.log(`📝 会話履歴追加(assistant): "${assistantMessage.content}"`);

      // ターン完了時にトランスクリプト全体を送信
      if (this.onTranscript) {
        this.onTranscript(assistantMessage.content, "output");
      }

      this.currentOutputTranscript = "";
      updated = true;
    }

    // 会話履歴が更新された場合、コールバックを呼び出す
    if (updated && this.onConversationUpdate) {
      this.onConversationUpdate(this.conversationHistory);
    }
  }

  /**
   * 保留中のツール呼び出しを処理
   * @private
   */
  async _processPendingToolCalls() {
    if (this.pendingFunctionCalls.length === 0) {
      return;
    }

    // ツール実行開始
    this.isExecutingTools = true;

    console.log(
      `\n🔧 ${this.pendingFunctionCalls.length}個のツールを非同期実行中...`,
    );

    // 各ツールを独立した非同期タスクとして実行
    const promises = this.pendingFunctionCalls.map(async (functionCall) => {
      try {
        const results = await executeTools([functionCall]);
        if (results.length > 0) {
          const result = results[0].functionResponse?.response?.result;
          await this.sendToolResponse(functionCall, result);
        }
      } catch (error) {
        console.error(`❌ ツール実行エラー (${functionCall.name}):`, error);
        await this.sendToolResponse(functionCall, { error: error.message });
      }
    });

    this.pendingFunctionCalls = [];

    // すべてのツール実行完了を待つ
    await Promise.all(promises);

    // ツール実行完了
    this.isExecutingTools = false;
  }

  /**
   * 接続状態を取得
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isProcessing: this.isProcessing,
      isGenerating: this.isGenerating,
      isExecutingTools: this.isExecutingTools,
      hasPendingToolCalls: this.pendingFunctionCalls.length > 0,
    };
  }

  /**
   * 会話履歴を取得
   * @returns {Array} 会話履歴の配列
   */
  getConversationHistory() {
    return this.conversationHistory;
  }

  /**
   * 会話履歴をクリア
   */
  clearConversationHistory() {
    this.conversationHistory = [];
    this.currentInputTranscript = "";
    this.currentOutputTranscript = "";
    console.log("🗑️ 会話履歴をクリアしました");
  }
}

export default GeminiLiveClient;
