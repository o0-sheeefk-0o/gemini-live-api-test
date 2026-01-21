/**
 * 音声認識WebSocketサーバ（音声ストリーミング対応）
 * クライアントからの音声を受信し、Gemini Live APIで処理して音声で返却
 */

import { WebSocketServer } from 'ws';
import { config, validateConfig } from './config.js';
import GeminiLiveClient from './gemini-live-client.js';

// 設定を検証
validateConfig();

// WebSocketサーバを作成
const wss = new WebSocketServer({
  port: config.server.port,
  host: config.server.host,
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║   音声認識サーバ (Gemini Live API - 音声ストリーミング)   ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`🚀 WebSocketサーバ起動: ws://${config.server.host}:${config.server.port}`);
console.log(`📋 モデル: ${config.gemini.model}`);
console.log(`🎤 入力音声: PCM 16bit ${config.audio.inputSampleRate}Hz mono`);
console.log(`🔊 出力音声: PCM 16bit ${config.audio.outputSampleRate}Hz mono`);
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
    isGeminiConnected: false,
  };

  // Gemini Live APIのコールバックを設定
  setupGeminiCallbacks(ws, clientContext);

  // Gemini Live APIに接続
  try {
    await clientContext.geminiClient.connect();
    clientContext.isGeminiConnected = true;
  } catch (error) {
    console.error(`❌ Gemini Live API接続エラー:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to connect to Gemini Live API',
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
      inputAudio: {
        sampleRate: config.audio.inputSampleRate,
        channels: 1,
        bitDepth: 16,
        format: 'pcm',
      },
      outputAudio: {
        sampleRate: config.audio.outputSampleRate,
        channels: 1,
        bitDepth: 16,
        format: 'pcm',
      },
    },
  }));

  // メッセージ受信
  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) {
        // バイナリデータ = 音声データ
        await handleAudioData(ws, clientContext, data);
      } else {
        // テキストデータ = JSONメッセージ
        const message = JSON.parse(data.toString());
        await handleJsonMessage(ws, clientContext, message);
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
  ws.on('close', async () => {
    console.log(`\n❌ クライアント切断: ${clientId}`);
    if (clientContext.geminiClient) {
      await clientContext.geminiClient.disconnect();
    }
    clients.delete(clientId);
  });

  // エラー
  ws.on('error', (error) => {
    console.error(`❌ WebSocketエラー (${clientId}):`, error);
  });
});

/**
 * Gemini Live APIのコールバックを設定
 */
function setupGeminiCallbacks(ws, clientContext) {
  const gemini = clientContext.geminiClient;

  // 音声応答チャンク
  gemini.onAudioChunk = (audioData, mimeType) => {
    // バイナリ音声データを直接送信
    if (ws.readyState === ws.OPEN) {
      ws.send(audioData);
    }
  };

  // テキスト応答チャンク
  gemini.onTextChunk = (text) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'text',
        data: text,
      }));
    }
  };

  // トランスクリプト（音声認識結果）
  gemini.onTranscript = (transcript, direction) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'transcript',
        direction: direction, // 'input' or 'output'
        data: transcript,
      }));
    }
  };

  // ツール呼び出し
  gemini.onToolCall = (functionCall) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'tool_call',
        data: {
          name: functionCall.name,
          args: functionCall.args,
        },
      }));
    }
  };

  // ターン完了
  gemini.onTurnComplete = () => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'turn_complete',
      }));
    }
  };

  // エラー
  gemini.onError = (error) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message || 'Gemini API error',
      }));
    }
  };
}

/**
 * 音声データを処理（バイナリ）
 */
async function handleAudioData(ws, clientContext, audioData) {
  if (!clientContext.isGeminiConnected) {
    console.warn('⚠️ Gemini未接続のため音声を無視');
    return;
  }

  // 音声データをGemini Live APIに転送
  await clientContext.geminiClient.sendAudio(audioData);
}

/**
 * JSONメッセージを処理
 */
async function handleJsonMessage(ws, clientContext, message) {
  switch (message.type) {
    case 'audio':
      // Base64エンコードされた音声データ
      if (message.data) {
        const audioBuffer = Buffer.from(message.data, 'base64');
        await handleAudioData(ws, clientContext, audioBuffer);
      }
      break;

    case 'text':
      // テキストメッセージを処理
      console.log(`📝 テキスト受信: "${message.data}"`);
      await clientContext.geminiClient.sendText(message.data);
      break;

    case 'get_status':
      // 接続状態を取得
      const status = clientContext.geminiClient.getStatus();
      ws.send(JSON.stringify({
        type: 'status',
        data: status,
      }));
      break;

    default:
      console.warn(`⚠️ 未知のメッセージタイプ: ${message.type}`);
  }
}

// グレースフルシャットダウン
process.on('SIGINT', async () => {
  console.log('\n\n🛑 サーバをシャットダウンしています...');

  // 全クライアントのGemini接続を切断
  for (const [clientId, context] of clients.entries()) {
    console.log(`   切断中: ${clientId}`);
    if (context.geminiClient) {
      await context.geminiClient.disconnect();
    }
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
