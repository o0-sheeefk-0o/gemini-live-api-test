/**
 * 音声認識WebSocketサーバ（音声ストリーミング対応）
 * クライアントからの音声を受信し、Gemini Live APIで処理して音声で返却
 */

import http from "http";
import { WebSocketServer } from "ws";
import { config, validateConfig } from "./config.js";
import GeminiLiveClient from "./gemini-live-client.js";

// 設定を検証
validateConfig();

// HTTPサーバを作成
const server = http.createServer(handleHttpRequest);

// WebSocketサーバを作成（HTTPサーバーにアタッチ）
const wss = new WebSocketServer({ server });

console.log(`
╔══════════════════════════════════════════════════════════╗
║   音声認識サーバ (Gemini Live API - 音声ストリーミング)   ║
╚══════════════════════════════════════════════════════════╝
`);

console.log(`📋 モデル: ${config.gemini.model}`);
console.log(`🎤 入力音声: PCM 16bit ${config.audio.inputSampleRate}Hz mono`);
console.log(`🔊 出力音声: PCM 16bit ${config.audio.outputSampleRate}Hz mono`);
console.log("");

// HTTPサーバーを起動
server.listen(config.server.port, config.server.host, () => {
  console.log(
    `🚀 サーバ起動: http://${config.server.host}:${config.server.port}`,
  );
  console.log(
    `   WebSocket: ws://${config.server.host}:${config.server.port}`,
  );
  console.log(`   REST API: http://${config.server.host}:${config.server.port}/api`);
  console.log("");
});

// クライアント接続管理
const clients = new Map();

/**
 * HTTPリクエストを処理
 */
function handleHttpRequest(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // GET /api/clients - 接続中のクライアント一覧
  if (req.method === "GET" && url.pathname === "/api/clients") {
    const clientList = Array.from(clients.entries()).map(([id, context]) => ({
      id,
      connectedAt: context.connectedAt,
      isGeminiConnected: context.isGeminiConnected,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ clients: clientList }));
    return;
  }

  // POST /api/context/:clientId - 特定のクライアントにコンテキスト送信
  if (req.method === "POST" && url.pathname.startsWith("/api/context/")) {
    const clientId = url.pathname.split("/api/context/")[1];

    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const { context } = JSON.parse(body);

        if (!context) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "context is required" }));
          return;
        }

        const clientContext = clients.get(clientId);
        if (!clientContext) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Client not found" }));
          return;
        }

        await clientContext.geminiClient.sendContext(context);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, clientId, context }));
      } catch (error) {
        console.error("❌ コンテキスト送信エラー:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/broadcast/context - 全クライアントにコンテキスト送信
  if (req.method === "POST" && url.pathname === "/api/broadcast/context") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const { context } = JSON.parse(body);

        if (!context) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "context is required" }));
          return;
        }

        const results = [];
        for (const [clientId, clientContext] of clients.entries()) {
          try {
            await clientContext.geminiClient.sendContext(context);
            results.push({ clientId, success: true });
          } catch (error) {
            results.push({ clientId, success: false, error: error.message });
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            context,
            results,
            totalClients: clients.size,
          }),
        );
      } catch (error) {
        console.error("❌ ブロードキャストエラー:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // 404 Not Found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

wss.on("connection", async (ws, req) => {
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
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Failed to connect to Gemini Live API",
        error: error.message,
      }),
    );
    ws.close();
    return;
  }

  clients.set(clientId, clientContext);

  // 接続成功メッセージを送信
  ws.send(
    JSON.stringify({
      type: "connected",
      clientId: clientId,
      config: {
        inputAudio: {
          sampleRate: config.audio.inputSampleRate,
          channels: 1,
          bitDepth: 16,
          format: "pcm",
        },
        outputAudio: {
          sampleRate: config.audio.outputSampleRate,
          channels: 1,
          bitDepth: 16,
          format: "pcm",
        },
      },
    }),
  );

  // メッセージ受信
  ws.on("message", async (data, isBinary) => {
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
      console.error("❌ メッセージ処理エラー:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Failed to process message",
          error: error.message,
        }),
      );
    }
  });

  // 接続クローズ
  ws.on("close", async () => {
    console.log(`\n❌ クライアント切断: ${clientId}`);
    if (clientContext.geminiClient) {
      await clientContext.geminiClient.disconnect();
    }
    clients.delete(clientId);
  });

  // エラー
  ws.on("error", (error) => {
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
      ws.send(
        JSON.stringify({
          type: "text",
          data: text,
        }),
      );
    }
  };

  // トランスクリプト（音声認識結果）
  gemini.onTranscript = (transcript, direction) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "transcript",
          direction: direction, // 'input' or 'output'
          data: transcript,
        }),
      );
    }
  };

  // ツール呼び出し
  gemini.onToolCall = (functionCall) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "tool_call",
          data: {
            name: functionCall.name,
            args: functionCall.args,
          },
        }),
      );
    }
  };

  // ターン完了
  gemini.onTurnComplete = () => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "turn_complete",
        }),
      );
    }
  };

  // エラー
  gemini.onError = (error) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message || "Gemini API error",
        }),
      );
    }
  };

  // 会話履歴更新
  gemini.onConversationUpdate = (conversationHistory) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "conversation_update",
          data: conversationHistory,
        }),
      );
    }
  };
}

/**
 * 音声データを処理（バイナリ）
 */
async function handleAudioData(ws, clientContext, audioData) {
  if (!clientContext.isGeminiConnected) {
    console.warn("⚠️ Gemini未接続のため音声を無視");
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
    case "audio":
      // Base64エンコードされた音声データ
      if (message.data) {
        const audioBuffer = Buffer.from(message.data, "base64");
        await handleAudioData(ws, clientContext, audioBuffer);
      }
      break;

    case "text":
      // テキストメッセージを処理
      console.log(`📝 テキスト受信: "${message.data}"`);
      await clientContext.geminiClient.sendText(message.data);
      break;

    case "context":
      // コンテキスト情報を処理（応答なし）
      console.log(`📊 コンテキスト受信: "${message.data}"`);
      await clientContext.geminiClient.sendContext(message.data);
      break;

    case "get_status":
      // 接続状態を取得
      const status = clientContext.geminiClient.getStatus();
      ws.send(
        JSON.stringify({
          type: "status",
          data: status,
        }),
      );
      break;

    case "get_conversation":
      // 会話履歴を取得
      const conversationHistory =
        clientContext.geminiClient.getConversationHistory();
      ws.send(
        JSON.stringify({
          type: "conversation_history",
          data: conversationHistory,
        }),
      );
      break;

    case "clear_conversation":
      // 会話履歴をクリア
      clientContext.geminiClient.clearConversationHistory();
      ws.send(
        JSON.stringify({
          type: "conversation_cleared",
        }),
      );
      break;

    default:
      console.warn(`⚠️ 未知のメッセージタイプ: ${message.type}`);
  }
}

// グレースフルシャットダウン
process.on("SIGINT", async () => {
  console.log("\n\n🛑 サーバをシャットダウンしています...");

  // 全クライアントのGemini接続を切断
  for (const [clientId, context] of clients.entries()) {
    console.log(`   切断中: ${clientId}`);
    if (context.geminiClient) {
      await context.geminiClient.disconnect();
    }
  }

  wss.close(() => {
    console.log("✓ WebSocketサーバを停止しました");
    server.close(() => {
      console.log("✓ HTTPサーバを停止しました");
      process.exit(0);
    });
  });
});

// エラーハンドリング
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});
