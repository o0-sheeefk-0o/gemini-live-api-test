# Gemini Live API 音声認識サーバ - 実装ログ

## 実装日: 2026-01-25

---

## 実装内容サマリー

このセッションで実装した主な機能:

1. **Gemini Live API接続エラーの修正**
2. **音声割り込み機能の実装**
3. **コンテキスト送信機能の追加（車両制御対応）**
4. **HTTPエンドポイントの追加**
5. **HTMLクライアントの拡張**

---

## 1. Gemini Live API接続エラーの修正

### 問題
接続完了後に「Request contains an invalid argument」エラーが発生し、切断される問題。

### 原因
`src/tools/index.js`のツール定義フォーマットが不正だった。
配列でラップされたオブジェクトを返していたが、Gemini Live APIはオブジェクトを直接期待していた。

### 修正内容
**ファイル:** `src/tools/index.js`

```javascript
// 修正前
export function getToolDefinitions() {
  return [
    {
      functionDeclarations: [...]
    }
  ];
}

// 修正後
export function getToolDefinitions() {
  return {
    functionDeclarations: [...]
  };
}
```

外側の配列を削除し、オブジェクトを直接返すように変更。

---

## 2. 音声割り込み機能の実装

### 要件
- ユーザーの新しい発話があったら、Geminiの応答中でも中断して新しい入力に応答する
- 現状では、Geminiの発話が完了するまで次の応答が返らない

### 実装内容

**ファイル:** `src/gemini-live-client.js`

#### 2.1 `isGenerating`フラグの追加

```javascript
constructor() {
  // ...
  this.isGenerating = false; // Geminiが応答中かどうか
}
```

#### 2.2 `sendAudio`メソッドの修正

```javascript
async sendAudio(audioData) {
  // ...

  // Geminiが応答中の場合、割り込みを発生させる
  if (this.isGenerating) {
    console.log("⚡ 割り込み発生: Geminiの応答を中断します");
    this.isGenerating = false;
    this.pendingFunctionCalls = [];
  }

  await this.session.sendRealtimeInput({...});
}
```

#### 2.3 `_handleMessage`メソッドの修正

```javascript
// モデルのターン（応答）開始時
if (serverContent.modelTurn) {
  this.isGenerating = true;  // 応答開始
  // ...
}

// ターン完了時
if (serverContent.turnComplete) {
  this.isGenerating = false;  // 応答終了
  // ...
}

// 割り込み検知時
if (serverContent.interrupted) {
  this.isGenerating = false;  // 応答中断
  this.pendingFunctionCalls = [];
}
```

#### 2.4 `getStatus`メソッドの更新

```javascript
getStatus() {
  return {
    isConnected: this.isConnected,
    isProcessing: this.isProcessing,
    isGenerating: this.isGenerating,  // 追加
    hasPendingToolCalls: this.pendingFunctionCalls.length > 0,
  };
}
```

---

## 3. コンテキスト送信機能の追加（車両制御対応）

### 要件
- 車両の状態などを定期的にGeminiに認識させたい
- コンテキスト送信時は音声応答を返さないようにしたい
- ユーザーが質問した時だけ、記憶したコンテキストを参照して応答する

### 実装内容

#### 3.1 `sendText`メソッドの拡張

**ファイル:** `src/gemini-live-client.js`

```javascript
/**
 * @param {string} text - テキストメッセージ
 * @param {Object} options - オプション
 * @param {boolean} options.expectResponse - 応答を期待するか（デフォルト: true）
 */
async sendText(text, options = { expectResponse: true }) {
  const expectResponse = options.expectResponse !== false;

  await this.session.sendClientContent({
    turns: text,
    turnComplete: expectResponse,  // 応答の有無を制御
  });
}
```

#### 3.2 `sendContext`メソッドの追加

**ファイル:** `src/gemini-live-client.js`

```javascript
/**
 * コンテキスト情報を送信（応答なし）
 * 車両状態など、Geminiに認識させたいが応答は不要な情報を送る
 */
async sendContext(contextInfo) {
  console.log(`📊 コンテキスト送信: "${contextInfo}"`);

  await this.session.sendClientContent({
    turns: contextInfo,
    turnComplete: false,  // 応答を期待しない
  });
}
```

#### 3.3 WebSocketサーバーの拡張

**ファイル:** `src/server.js`

```javascript
case "context":
  // コンテキスト情報を処理（応答なし）
  console.log(`📊 コンテキスト受信: "${message.data}"`);
  await clientContext.geminiClient.sendContext(message.data);
  break;
```

#### 3.4 システムプロンプトの更新

**ファイル:** `src/config.js`

```javascript
systemInstruction: `あなたは車両制御対応の音声アシスタントです。
以下のガイドラインに従ってください：
1. 簡潔で分かりやすい回答を心がける
2. ユーザーが質問した内容に正確に答える
3. 必要に応じてツールを使用して情報を取得する
4. 自然な会話を心がける
5. 日本語で応答する
6. 車両状態の情報が送られてきた場合は、サイレントに記憶するだけで応答は不要です
7. ユーザーから車両に関する質問があった場合のみ、記憶している車両状態を参照して回答してください`,
```

---

## 4. HTTPエンドポイントの追加

### 要件
外部システムから車両情報などのコンテキストを送信できるREST APIを提供する。

### 実装内容

**ファイル:** `src/server.js`

#### 4.1 HTTPサーバーの追加

```javascript
import http from "http";

// HTTPサーバを作成
const server = http.createServer(handleHttpRequest);

// WebSocketサーバを作成（HTTPサーバーにアタッチ）
const wss = new WebSocketServer({ server });
```

#### 4.2 HTTPリクエストハンドラーの実装

```javascript
function handleHttpRequest(req, res) {
  // CORS設定
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // エンドポイント処理...
}
```

#### 4.3 追加されたエンドポイント

##### GET /api/clients
接続中のクライアント一覧を取得

**リクエスト例:**
```bash
curl http://localhost:8080/api/clients
```

**レスポンス例:**
```json
{
  "clients": [
    {
      "id": "client_1234567890_abc123",
      "connectedAt": "2026-01-25T10:30:00.000Z",
      "isGeminiConnected": true
    }
  ]
}
```

##### POST /api/context/:clientId
特定のクライアントにコンテキスト情報を送信

**リクエスト例:**
```bash
curl -X POST http://localhost:8080/api/context/client_1234567890_abc123 \
  -H "Content-Type: application/json" \
  -d '{"context": "車両状態: 速度60km/h、燃料75%、車内温度22°C"}'
```

**レスポンス例:**
```json
{
  "success": true,
  "clientId": "client_1234567890_abc123",
  "context": "車両状態: 速度60km/h、燃料75%、車内温度22°C"
}
```

##### POST /api/broadcast/context
接続中の全クライアントにコンテキスト情報を一斉送信

**リクエスト例:**
```bash
curl -X POST http://localhost:8080/api/broadcast/context \
  -H "Content-Type: application/json" \
  -d '{"context": "システムアラート: メンテナンスが必要です"}'
```

**レスポンス例:**
```json
{
  "success": true,
  "context": "システムアラート: メンテナンスが必要です",
  "totalClients": 2,
  "results": [
    {"clientId": "client_1234567890_abc123", "success": true},
    {"clientId": "client_1234567891_def456", "success": true}
  ]
}
```

#### 4.4 サーバー起動処理の更新

```javascript
server.listen(config.server.port, config.server.host, () => {
  console.log(`🚀 サーバ起動: http://${config.server.host}:${config.server.port}`);
  console.log(`   WebSocket: ws://${config.server.host}:${config.server.port}`);
  console.log(`   REST API: http://${config.server.host}:${config.server.port}/api`);
});
```

---

## 5. HTMLクライアントの拡張

### 要件
ブラウザから簡単にコンテキスト情報を送信できるUIを追加する。

### 実装内容

**ファイル:** `client/test-client.html`

#### 5.1 UIセクションの追加

```html
<div class="section">
  <div class="section-title">コンテキスト送信（車両情報など）</div>
  <div class="input-group">
    <input
      type="text"
      id="contextInput"
      placeholder="例: 車両状態: 速度60km/h、燃料75%、車内温度22°C"
    />
    <button
      class="btn-success"
      onclick="sendContext()"
      id="sendContextBtn"
      disabled
    >
      コンテキスト送信
    </button>
  </div>
  <div style="margin-top: 10px; font-size: 13px; color: #666;">
    ℹ️ コンテキスト情報は音声応答なしでGeminiに送られます（記憶のみ）
  </div>
</div>
```

#### 5.2 JavaScript関数の追加

```javascript
// コンテキスト送信
function sendContext() {
  const input = document.getElementById("contextInput");
  const text = input.value.trim();

  if (!text) return;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addLog("先に接続してください", "error");
    return;
  }

  addLog(`コンテキスト送信: ${text}`, "info");
  ws.send(JSON.stringify({
    type: "context",
    data: text,
  }));

  input.value = "";
}

// Enterキーでコンテキスト送信
document.getElementById("contextInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendContext();
  }
});
```

#### 5.3 ボタン状態管理の更新

```javascript
// 接続時
case "connected":
  // ...
  document.getElementById("sendContextBtn").disabled = false;
  break;

// 切断時
ws.onclose = () => {
  // ...
  document.getElementById("sendContextBtn").disabled = true;
};
```

---

## 使用例

### 1. WebSocketクライアントからコンテキスト送信

```javascript
// ブラウザのJavaScriptから
ws.send(JSON.stringify({
  type: "context",
  data: "車両状態: 速度60km/h、燃料75%、車内温度22°C"
}));
```

### 2. HTTPエンドポイントから定期的に送信

```javascript
// Node.jsスクリプト例
setInterval(async () => {
  const vehicleData = {
    speed: getCurrentSpeed(),
    fuel: getFuelLevel(),
    temperature: getTemperature(),
    engineStatus: getEngineStatus()
  };

  const context = `車両状態: 速度${vehicleData.speed}km/h、燃料${vehicleData.fuel}%、車内温度${vehicleData.temperature}°C、エンジン${vehicleData.engineStatus}`;

  await fetch('http://localhost:8080/api/broadcast/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context })
  });
}, 5000); // 5秒ごと
```

### 3. HTMLクライアントから送信

1. ブラウザで `client/test-client.html` を開く
2. 「接続」ボタンをクリック
3. 「コンテキスト送信」セクションに情報を入力
4. 「コンテキスト送信」ボタンをクリックまたはEnterキー

---

## アーキテクチャ概要

```
┌─────────────────┐
│  HTMLクライアント │
│ (ブラウザ)       │
└────────┬────────┘
         │ WebSocket (音声 + コンテキスト)
         │
┌────────▼────────┐      ┌──────────────┐
│  WebSocketサーバ │      │ 外部システム  │
│  (server.js)    │◄─────│ (車両制御等)  │
└────────┬────────┘ HTTP │              │
         │                └──────────────┘
         │ sendContext()
         │
┌────────▼────────────┐
│ GeminiLiveClient    │
│ (gemini-live-client)│
└────────┬────────────┘
         │
┌────────▼────────────┐
│  Gemini Live API    │
│  (Google Cloud)     │
└─────────────────────┘
```

---

## 変更されたファイル一覧

1. `src/tools/index.js` - ツール定義フォーマット修正
2. `src/gemini-live-client.js` - 割り込み機能、コンテキスト送信機能の追加
3. `src/server.js` - HTTPサーバー、REST APIエンドポイントの追加
4. `src/config.js` - システムプロンプトの更新（車両制御対応）
5. `client/test-client.html` - コンテキスト送信UIの追加

---

## 今後の拡張案

### 1. コンテキストの永続化
- 車両状態履歴をデータベースに保存
- セッション再接続時にコンテキストを復元

### 2. 車両制御ツールの追加
- エアコン制御
- ナビゲーション設定
- 音楽再生制御

### 3. マルチモーダル対応
- カメラ映像の送信
- 画像認識との連携

### 4. セキュリティ強化
- API認証の追加
- クライアントIDの検証
- レート制限の実装

---

## 技術スタック

- **サーバー:** Node.js + WebSocket (ws)
- **AI:** Google Gemini Live API (gemini-2.0-flash-exp)
- **音声:** PCM 16bit, 16kHz (入力) / 24kHz (出力)
- **フロントエンド:** Vanilla JavaScript + Web Audio API
- **プロトコル:** WebSocket (音声ストリーミング), HTTP REST API (コンテキスト送信)

---

## 注意事項

1. **APIキーの管理**
   - `.env`ファイルのAPIキーは絶対にGitにコミットしない
   - 本番環境では環境変数から読み込む

2. **音声フォーマット**
   - 入力: PCM 16bit 16kHz mono
   - 出力: PCM 16bit 24kHz mono
   - フォーマットが異なると音声が正しく処理されない

3. **コンテキストの送信頻度**
   - あまり頻繁に送ると、Geminiのコンテキストウィンドウを圧迫する
   - 変更があった時のみ送信するか、5秒以上の間隔を推奨

4. **割り込み動作**
   - `sendRealtimeInput`を送信すると自動的にGeminiの応答が中断される
   - ツール呼び出しが実行中の場合も中断されるので注意

---

## デバッグ情報

### ログの見方

```
🚀 Gemini Live API に接続中...
✓ Gemini Live API 接続完了
📊 コンテキスト送信: "車両状態: 速度60km/h、燃料75%"
🎤 入力トランスクリプト: 今の速度は？
💬 テキスト応答: 現在の速度は60km/hです
🔊 出力トランスクリプト: 現在の速度は60km/hです
✓ ターン完了
⚡ 割り込み発生: Geminiの応答を中断します
⚠️ 割り込み検知
```

### よくあるエラーと対処法

1. **"Request contains an invalid argument"**
   - ツール定義のフォーマットが不正
   - `getToolDefinitions()`の戻り値を確認

2. **"セッションが接続されていません"**
   - Gemini Live APIに接続する前に音声を送信している
   - `connect()`を先に呼び出す

3. **音声が再生されない**
   - サンプルレートが間違っている
   - ブラウザのAudioContext設定を確認

---

## まとめ

本セッションでは、Gemini Live APIを使った音声認識サーバーに以下の機能を追加しました:

✅ API接続エラーの修正
✅ 音声割り込み機能（リアルタイムな会話体験）
✅ コンテキスト送信機能（車両制御などのユースケースに対応）
✅ REST APIエンドポイント（外部システム連携）
✅ HTMLクライアントUI（ユーザーフレンドリーなインターフェース）

これにより、車両内での音声アシスタント、リアルタイムな状態監視と対話、外部システムとの統合が可能になりました。
