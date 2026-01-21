# 音声認識サーバ (Gemini Live API)

Gemini Live APIを使用した音声認識WebSocketサーバです。ウェイクワード検知、ツール実行（天気情報取得）、音声+テキスト応答に対応しています。

## 機能

- ✅ **WebSocketベースのリアルタイム通信**
- ✅ **カスタムウェイクワード検知**（gemini、ジェミニ、hey gemini）
- ✅ **ツール実行（Function Calling）**
  - 天気情報取得 (`get_weather`)
  - 天気予報取得 (`get_forecast`)
  - 天気アラート確認 (`get_weather_alerts`)
- ✅ **音声+テキスト両方の応答モダリティ**
- ✅ **ストリーミングレスポンス**
- ✅ **チャット履歴管理**

## ディレクトリ構成

```
voice-recognition-server/
├── src/
│   ├── server.js              # メインWebSocketサーバ
│   ├── gemini-client.js       # Gemini Live APIクライアント
│   ├── audio-processor.js     # 音声処理・バッファリング
│   ├── wake-word-detector.js  # ウェイクワード検知
│   ├── config.js              # 設定ファイル
│   └── tools/
│       ├── index.js           # ツール定義・実行マネージャー
│       └── weather.js         # 天気情報取得ツール
├── client/
│   └── test-client.html       # テスト用Webクライアント
├── package.json
├── .env.example
└── README.md
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
cd voice-recognition-server
npm install
```

### 2. 環境変数の設定

`.env.example`をコピーして`.env`を作成：

```bash
cp .env.example .env
```

`.env`ファイルを編集してAPIキーを設定：

```env
GEMINI_API_KEY=your_api_key_here
PORT=8080
HOST=0.0.0.0
```

### 3. サーバ起動

```bash
npm start
```

または開発モード（ファイル変更時に自動再起動）：

```bash
npm run dev
```

サーバが起動すると以下のように表示されます：

```
╔══════════════════════════════════════════════════════════╗
║       音声認識サーバ (Gemini Live API)                    ║
╚══════════════════════════════════════════════════════════╝

🚀 WebSocketサーバ起動: ws://0.0.0.0:8080
📋 モデル: gemini-2.0-flash-exp
🎤 ウェイクワード: gemini, ジェミニ, hey gemini
📡 応答モダリティ: AUDIO, TEXT
```

## 使い方

### テストクライアントを使用

ブラウザで `client/test-client.html` を開きます：

```bash
open client/test-client.html
# または
# Windowsの場合: start client/test-client.html
# Linuxの場合: xdg-open client/test-client.html
```

1. **「接続」**ボタンをクリックしてサーバに接続
2. **テキスト入力**でメッセージを送信（ウェイクワードを含める）
   - 例: "gemini 東京の天気を教えて"
3. **音声入力**ボタンで音声認識を開始（Web Speech API使用）

### WebSocketプロトコル

#### 接続

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

#### メッセージ送信

**テキストメッセージ**:
```javascript
ws.send(JSON.stringify({
  type: 'text',
  data: 'gemini 東京の天気を教えて'
}));
```

**履歴クリア**:
```javascript
ws.send(JSON.stringify({
  type: 'clear_history'
}));
```

**統計情報取得**:
```javascript
ws.send(JSON.stringify({
  type: 'get_stats'
}));
```

#### メッセージ受信

**接続成功**:
```json
{
  "type": "connected",
  "clientId": "client_xxx",
  "config": {
    "wakeWords": ["gemini", "ジェミニ", "hey gemini"],
    "responseModalities": ["AUDIO", "TEXT"],
    "audioConfig": { ... }
  }
}
```

**処理開始**:
```json
{
  "type": "processing_started"
}
```

**ストリーミングチャンク**:
```json
{
  "type": "chunk",
  "chunkType": "text", // または "function_call", "tool_results", "final_text"
  "data": "テキストまたはツール情報"
}
```

**完了**:
```json
{
  "type": "completed",
  "text": "完全な応答テキスト",
  "hadToolCalls": true
}
```

**エラー**:
```json
{
  "type": "error",
  "message": "エラーメッセージ",
  "error": "詳細なエラー情報"
}
```

## ウェイクワード検知

システムは以下のウェイクワードを検知します：

- `gemini`
- `ジェミニ`
- `hey gemini`

**例**:
- ✅ "gemini 東京の天気を教えて" → 検知される
- ✅ "hey gemini、今日の天気は？" → 検知される
- ❌ "東京の天気を教えて" → 検知されない（ウェイクワードなし）

ウェイクワードは大文字小文字を区別せず、デバウンス機能（2秒以内の重複検知を無視）が実装されています。

### ウェイクワードのカスタマイズ

`src/config.js`を編集：

```javascript
wakeWord: {
  keywords: ['your-custom-word', 'another-word'],
  enabled: true,
  caseSensitive: false,
}
```

## ツール（Function Calling）

### 利用可能なツール

#### 1. get_weather
現在の天気情報を取得します。

```
例: "gemini 東京の天気を教えて"
```

#### 2. get_forecast
指定日数の天気予報を取得します。

```
例: "hey gemini 大阪の3日間の天気予報を教えて"
```

#### 3. get_weather_alerts
天気アラート・警報情報を確認します。

```
例: "ジェミニ 東京に天気アラートはある？"
```

### カスタムツールの追加

1. `src/tools/`に新しいツールファイルを作成
2. `src/tools/index.js`にツール定義と実行ロジックを追加

**例**: `src/tools/custom-tool.js`
```javascript
export function myCustomTool(param) {
  // ツールのロジック
  return { result: 'some data' };
}
```

**例**: `src/tools/index.js`に追加
```javascript
import { myCustomTool } from './custom-tool.js';

export function getToolDefinitions() {
  return [{
    functionDeclarations: [
      // 既存のツール...
      {
        name: 'my_custom_tool',
        description: 'カスタムツールの説明',
        parameters: {
          type: 'object',
          properties: {
            param: { type: 'string', description: 'パラメータの説明' }
          },
          required: ['param']
        }
      }
    ]
  }];
}

export function executeTool(functionCall) {
  // ...
  case 'my_custom_tool':
    result = myCustomTool(args.param);
    break;
  // ...
}
```

## システムプロンプトのカスタマイズ

`src/config.js`の`systemInstruction`を編集：

```javascript
systemInstruction: `あなたはカスタムアシスタントです。
特定の役割や制約をここに記述してください。`
```

## トラブルシューティング

### サーバが起動しない

- `GEMINI_API_KEY`が正しく設定されているか確認
- ポート8080が使用可能か確認（他のプロセスが使用していないか）

### ウェイクワードが検知されない

- メッセージにウェイクワードが含まれているか確認
- `src/config.js`の`wakeWord.enabled`が`true`になっているか確認

### ツールが実行されない

- Geminiがツールを呼び出すかどうかは、質問内容に依存します
- より明確な質問を試してください（例: "東京の天気を教えて"）

### 音声入力が動作しない

- ブラウザが音声認識をサポートしているか確認（Chrome推奨）
- マイクのアクセス許可が与えられているか確認
- HTTPSまたはlocalhostでアクセスしているか確認

## 技術スタック

- **Node.js**: v18以上
- **WebSocket**: `ws` パッケージ
- **Gemini API**: `@google/generative-ai` パッケージ
- **環境変数管理**: `dotenv`

## 制限事項

- 現在の`@google/generative-ai`パッケージは、音声ストリーミングを直接サポートしていません
- 音声入力は、クライアント側でWeb Speech APIを使用してテキストに変換する必要があります
- `@google/genai`パッケージ（新しいSDK）を使用すると、音声ストリーミングが可能になります

## 今後の改善案

- [ ] `@google/genai`パッケージへの移行（音声ストリーミング対応）
- [ ] 実際の天気APIとの連携（OpenWeatherMap等）
- [ ] 音声出力機能の追加
- [ ] セッション永続化
- [ ] 認証・認可機能
- [ ] マルチユーザー対応
- [ ] パフォーマンスモニタリング

## ライセンス

MIT

## 参考

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Gemini Live API Guide](https://ai.google.dev/gemini-api/docs/live-guide)
