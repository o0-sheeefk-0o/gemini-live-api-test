# Gemini Live API サンプル

Gemini Live APIを使用して、リクエスト → ツール実行 → ストリーム応答を実現する簡単なサンプルコードです。

## 機能

このサンプルは以下の流れを実装しています：

1. **リクエスト送信**: ユーザーが「今の時刻を教えて」と質問
2. **ツール実行**: Geminiが`get_current_time`ツールを呼び出し
3. **ストリーム応答**: ツール実行結果を含む応答をストリームで受信

## セットアップ

### 1. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 2. APIキーの設定

Gemini APIキーを環境変数に設定します：

```bash
export GEMINI_API_KEY="your-api-key-here"
```

## 実行方法

```bash
python gemini_live_sample.py
```

## コードの流れ

### 1. WebSocket接続
```python
async with websockets.connect(url) as ws:
```

### 2. セットアップメッセージ送信
- モデル設定（gemini-2.0-flash-exp）
- ツール定義（`get_current_time`関数）

### 3. ユーザーメッセージ送信
```python
user_message = {
    "client_content": {
        "turns": [{"role": "user", "parts": [{"text": "今の時刻を教えてください"}]}],
        "turn_complete": True
    }
}
```

### 4. ストリーム応答受信
- Geminiからのツール呼び出しリクエストを検出
- `functionCall`を受信

### 5. ツール実行
- ローカルでツールを実行
- 結果を取得

### 6. ツール結果を送信
```python
tool_response = {
    "functionResponse": {
        "id": tool_call_id,
        "name": tool_name,
        "response": {"result": tool_result}
    }
}
```

### 7. 最終応答をストリームで受信
- Geminiがツール結果を使って最終的な回答を生成
- ストリームで受信・表示

## カスタマイズ

### 独自のツールを追加

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
def execute_tool(tool_name, args):
    if tool_name == "your_tool_name":
        return your_function(args.get("param1"))
```

## 注意事項

- Gemini Live APIは`gemini-2.0-flash-exp`など特定のモデルでのみ利用可能
- WebSocket接続が必要
- ストリーミング応答のため、リアルタイムでデータを受信

## 参考

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
