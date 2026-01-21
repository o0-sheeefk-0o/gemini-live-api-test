# Gemini Live API サンプル

Gemini Live APIを使用して、リクエスト → ツール実行 → ストリーム応答を実現する簡単なサンプルコードです。

Python版と Node.js版の両方を提供しています。

## 機能

このサンプルは以下の流れを実装しています：

1. **リクエスト送信**: ユーザーが「今の時刻を教えて」と質問
2. **ツール実行**: Geminiが`get_current_time`ツールを呼び出し
3. **ストリーム応答**: ツール実行結果を含む応答をストリームで受信

## ファイル構成

- `gemini_live_sample.py` - Python版サンプル
- `gemini_live_sample.js` - Node.js版サンプル
- `requirements.txt` - Python依存パッケージ
- `package.json` - Node.js依存パッケージ

---

## Python版

### セットアップ

#### 1. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

#### 2. APIキーの設定

Gemini APIキーを環境変数に設定します：

```bash
export GEMINI_API_KEY="your-api-key-here"
```

### 実行方法

```bash
python gemini_live_sample.py
```

---

## Node.js版

### セットアップ

#### 1. 依存パッケージのインストール

```bash
npm install
```

#### 2. APIキーの設定

Gemini APIキーを環境変数に設定します：

```bash
export GEMINI_API_KEY="your-api-key-here"
```

### 実行方法

```bash
npm start
# または
node gemini_live_sample.js
```

---

## コードの流れ

### Python版の主要ステップ

#### 1. クライアント作成
```python
client = genai.Client(api_key=api_key)
```

#### 2. ツール定義
```python
tools = [{
    "function_declarations": [{
        "name": "get_current_time",
        "description": "現在の日時を取得します",
        "parameters": {"type": "object", "properties": {}}
    }]
}]
```

#### 3. Live APIセッション開始
```python
async with client.aio.live.connect(model=model_id, config=config, tools=tools) as session:
```

#### 4. ユーザーメッセージ送信
```python
await session.send("今の時刻を教えてください", end_of_turn=True)
```

#### 5. ストリーム応答受信
```python
async for response in session.receive():
    # テキストやツール呼び出しを処理
```

#### 6. ツール実行 → 7. ツール結果を送信
```python
function_response = {
    "id": function_call.id,
    "name": function_call.name,
    "response": {"result": result}
}
await session.send(function_response, end_of_turn=True)
```

#### 8. 最終応答をストリームで受信
- Geminiがツール結果を使って最終的な回答を生成

### Node.js版の主要ステップ

#### 1. クライアント作成
```javascript
const genAI = new GoogleGenerativeAI(apiKey);
```

#### 2. ツール定義 + モデル取得
```javascript
const tools = [{
  functionDeclarations: [{
    name: 'get_current_time',
    description: '現在の日時を取得します',
    parameters: { type: 'object', properties: {} }
  }]
}];

const model = genAI.getGenerativeModel({ model: modelId, tools });
```

#### 3. チャットセッション開始
```javascript
const chat = model.startChat({ history: [] });
```

#### 4. ユーザーメッセージ送信（ストリーミング）
```javascript
const result = await chat.sendMessageStream(userPrompt);
```

#### 5. ストリーム応答受信
```javascript
for await (const chunk of result.stream) {
  // テキストやツール呼び出しを処理
}
```

#### 6. ツール実行 → 7. ツール結果を送信
```javascript
const functionResponses = [{
  functionResponse: {
    name: functionCall.name,
    response: { result: result }
  }
}];
await chat.sendMessageStream(functionResponses);
```

#### 8. 最終応答をストリームで受信
- Geminiがツール結果を使って最終的な回答を生成

## カスタマイズ

### 独自のツールを追加

#### Python版
```python
# ツール定義を追加
{
    "name": "your_tool_name",
    "description": "ツールの説明",
    "parameters": {
        "type": "object",
        "properties": {
            "param1": {"type": "string", "description": "パラメータの説明"}
        }
    }
}

# ツール実行関数に追加
def execute_tool(function_call):
    if function_call.name == "your_tool_name":
        return your_function(function_call.args.get("param1"))
```

#### Node.js版
```javascript
// ツール定義を追加
{
  name: 'your_tool_name',
  description: 'ツールの説明',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'パラメータの説明' }
    }
  }
}

// ツール実行関数に追加
function executeTool(functionCall) {
  if (functionCall.name === 'your_tool_name') {
    return yourFunction(functionCall.args.param1);
  }
}
```

## 注意事項

- `gemini-2.0-flash-exp`など特定のモデルでのみ利用可能
- ストリーミング応答のため、リアルタイムでデータを受信
- Python版は`genai.Client().aio.live`でWebSocket接続を使用
- Node.js版は`@google/generative-ai`の`startChat`でストリーミングチャットを使用

## 参考

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
