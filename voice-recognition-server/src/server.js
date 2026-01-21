/**
 * 音声認識WebSocketサーバ
 * クライアントからの音声/テキストを受信し、Gemini Live APIで処理
 */

import { WebSocketServer } from 'ws';
import { config, validateConfig } from './config.js';
import GeminiLiveClient from './gemini-client.js';
import AudioProcessor from './audio-processor.js';

// 設定を検証
validateConfig();

// WebSocketサーバを作成
const wss = new WebSocketServer({
  port: config.server.port,
  host: config.server.host,
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║       音声認識サーバ (Gemini Live API)                    ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`🚀 WebSocketサーバ起動: ws://${config.server.host}:${config.server.port}`);
console.log(`📋 モデル: ${config.gemini.model}`);
console.log(`🎤 ウェイクワード: ${config.wakeWord.keywords.join(', ')}`);
console.log(`📡 応答モダリティ: ${config.gemini.responseModalities.join(', ')}`);
console.log('');

// クライアント接続管理
const clients = new Map();

wss.on('connection', async (ws, req) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`\n✅ クライアント接続: ${clientId}`);
  console.log(`   IPアドレス: ${req.socket.remoteAddress}`);

  // クライアント用のコンテキストを作成
  const clientContext = {
    id: clientId,
    connectedAt: new Date(),
    geminiClient: new GeminiLiveClient(),
    audioProcessor: new AudioProcessor(),
  };

  // Gemini Live APIクライアントを初期化
  try {
    await clientContext.geminiClient.initialize();
  } catch (error) {
    console.error(`❌ Gemini Live API初期化エラー:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to initialize Gemini Live API',
      error: error.message,
    }));
    ws.close();
    return;
  }

  clients.set(clientId, clientContext);

  // 接続成功メッセージを送信
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: clientId,
    config: {
      wakeWords: config.wakeWord.keywords,
      responseModalities: config.gemini.responseModalities,
      audioConfig: config.audio,
    },
  }));

  // メッセージ受信
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'text':
          // テキストメッセージを処理
          await handleTextMessage(ws, clientContext, message.data);
          break;

        case 'audio':
          // 音声データを処理
          await handleAudioMessage(ws, clientContext, message.data);
          break;

        case 'clear_history':
          // チャット履歴をクリア
          clientContext.geminiClient.clearHistory();
          ws.send(JSON.stringify({
            type: 'history_cleared',
          }));
          break;

        case 'get_stats':
          // 統計情報を取得
          const stats = {
            gemini: clientContext.geminiClient.getStats(),
            audio: clientContext.audioProcessor.getStats(),
          };
          ws.send(JSON.stringify({
            type: 'stats',
            data: stats,
          }));
          break;

        default:
          console.warn(`⚠️ 未知のメッセージタイプ: ${message.type}`);
      }
    } catch (error) {
      console.error('❌ メッセージ処理エラー:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process message',
        error: error.message,
      }));
    }
  });

  // 接続クローズ
  ws.on('close', () => {
    console.log(`\n❌ クライアント切断: ${clientId}`);
    clients.delete(clientId);
  });

  // エラー
  ws.on('error', (error) => {
    console.error(`❌ WebSocketエラー (${clientId}):`, error);
  });
});

/**
 * テキストメッセージを処理
 * @param {WebSocket} ws - WebSocket接続
 * @param {Object} clientContext - クライアントコンテキスト
 * @param {string} text - テキストメッセージ
 */
async function handleTextMessage(ws, clientContext, text) {
  console.log(`\n📝 テキスト受信 (${clientContext.id}): "${text}"`);

  // 処理開始を通知
  ws.send(JSON.stringify({
    type: 'processing_started',
  }));

  try {
    await clientContext.geminiClient.processText(
      text,
      // チャンクコールバック
      (chunk) => {
        ws.send(JSON.stringify({
          type: 'chunk',
          chunkType: chunk.type,
          data: chunk.data,
        }));
      },
      // 完了コールバック
      (result) => {
        ws.send(JSON.stringify({
          type: 'completed',
          text: result.text,
          hadToolCalls: result.hadToolCalls,
        }));
      }
    );
  } catch (error) {
    console.error('❌ テキスト処理エラー:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to process text',
      error: error.message,
    }));
  }
}

/**
 * 音声データを処理
 * @param {WebSocket} ws - WebSocket接続
 * @param {Object} clientContext - クライアントコンテキスト
 * @param {Object} audioData - 音声データ
 */
async function handleAudioMessage(ws, clientContext, audioData) {
  console.log(`\n🎤 音声データ受信 (${clientContext.id})`);

  // 音声データをバッファに追加
  const buffer = Buffer.from(audioData, 'base64');
  clientContext.audioProcessor.addAudioData(buffer);

  // 注意: 現在の実装では、音声はクライアント側でテキストに変換することを推奨
  ws.send(JSON.stringify({
    type: 'audio_received',
    size: buffer.length,
    message: '音声データを受信しました。クライアント側でテキストに変換してください。',
  }));
}

// グレースフルシャットダウン
process.on('SIGINT', () => {
  console.log('\n\n🛑 サーバをシャットダウンしています...');

  // 全クライアントに通知
  for (const [clientId, context] of clients.entries()) {
    console.log(`   切断中: ${clientId}`);
  }

  wss.close(() => {
    console.log('✓ WebSocketサーバを停止しました');
    process.exit(0);
  });
});

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});
