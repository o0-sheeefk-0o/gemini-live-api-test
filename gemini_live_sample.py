"""
Gemini Live API サンプル
リクエスト → ツール実行 → ストリーム応答のシンプルな例
"""

import asyncio
import json
import os
import websockets
from datetime import datetime

# Gemini Live API エンドポイント
GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"


# サンプルツール定義: 現在時刻を取得
def get_current_time():
    """現在時刻を取得するツール"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ツール実行関数
def execute_tool(tool_name, args):
    """ツールを実行して結果を返す"""
    if tool_name == "get_current_time":
        return get_current_time()
    return f"Unknown tool: {tool_name}"


async def run_gemini_live_with_tool():
    """Gemini Live APIでツールを使用した会話を実行"""

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("環境変数 GEMINI_API_KEY を設定してください")

    # APIキーをURLに追加
    url = f"{GEMINI_LIVE_WS_URL}?key={api_key}"

    async with websockets.connect(url) as ws:
        print("✓ WebSocket接続成功\n")

        # 1. セットアップメッセージ（モデル設定 + ツール定義）
        setup_message = {
            "setup": {
                "model": "models/gemini-2.0-flash-exp",
                "generation_config": {
                    "response_modalities": ["TEXT"]
                },
                "tools": [
                    {
                        "function_declarations": [
                            {
                                "name": "get_current_time",
                                "description": "現在の日時を取得します",
                                "parameters": {
                                    "type": "object",
                                    "properties": {}
                                }
                            }
                        ]
                    }
                ]
            }
        }

        await ws.send(json.dumps(setup_message))
        print(f"→ セットアップ送信: {json.dumps(setup_message, ensure_ascii=False, indent=2)}\n")

        # セットアップ応答を受信
        setup_response = await ws.recv()
        print(f"← セットアップ応答: {json.dumps(json.loads(setup_response), ensure_ascii=False, indent=2)}\n")

        # 2. ユーザーメッセージ送信（ツール呼び出しを促すプロンプト）
        user_message = {
            "client_content": {
                "turns": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": "今の時刻を教えてください"
                            }
                        ]
                    }
                ],
                "turn_complete": True
            }
        }

        await ws.send(json.dumps(user_message))
        print(f"→ ユーザーメッセージ送信: {json.dumps(user_message, ensure_ascii=False, indent=2)}\n")

        # 3. ストリーム応答を受信（ツール呼び出しを検出）
        print("=" * 60)
        print("ストリーム応答受信開始")
        print("=" * 60)

        tool_call_detected = False
        tool_call_id = None
        tool_name = None
        tool_args = None

        while True:
            try:
                response = await ws.recv()
                data = json.loads(response)

                print(f"\n← 受信: {json.dumps(data, ensure_ascii=False, indent=2)}")

                # ツール呼び出しの検出
                if "serverContent" in data:
                    server_content = data["serverContent"]

                    if "modelTurn" in server_content:
                        model_turn = server_content["modelTurn"]

                        if "parts" in model_turn:
                            for part in model_turn["parts"]:
                                # Function callの検出
                                if "functionCall" in part:
                                    tool_call_detected = True
                                    function_call = part["functionCall"]
                                    tool_call_id = function_call.get("id")
                                    tool_name = function_call.get("name")
                                    tool_args = function_call.get("args", {})

                                    print(f"\n🔧 ツール呼び出し検出!")
                                    print(f"   ツール名: {tool_name}")
                                    print(f"   ID: {tool_call_id}")
                                    print(f"   引数: {tool_args}")

                                # テキスト応答の表示
                                if "text" in part:
                                    print(f"\n💬 テキスト応答: {part['text']}")

                    # ターン完了チェック
                    if server_content.get("turnComplete"):
                        print("\n✓ ターン完了")
                        break

            except websockets.exceptions.ConnectionClosed:
                print("\n接続が閉じられました")
                break

        # 4. ツールが呼び出された場合、実行して結果を返す
        if tool_call_detected:
            print(f"\n{'=' * 60}")
            print("ツール実行")
            print("=" * 60)

            # ツールを実行
            tool_result = execute_tool(tool_name, tool_args)
            print(f"✓ ツール実行結果: {tool_result}\n")

            # ツール実行結果をGeminiに送信
            tool_response_message = {
                "client_content": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [
                                {
                                    "functionResponse": {
                                        "id": tool_call_id,
                                        "name": tool_name,
                                        "response": {
                                            "result": tool_result
                                        }
                                    }
                                }
                            ]
                        }
                    ],
                    "turn_complete": True
                }
            }

            await ws.send(json.dumps(tool_response_message))
            print(f"→ ツール実行結果送信: {json.dumps(tool_response_message, ensure_ascii=False, indent=2)}\n")

            # 5. 最終応答をストリームで受信
            print("=" * 60)
            print("最終応答ストリーム受信")
            print("=" * 60)

            full_response = ""

            while True:
                try:
                    response = await ws.recv()
                    data = json.loads(response)

                    print(f"\n← 受信: {json.dumps(data, ensure_ascii=False, indent=2)}")

                    if "serverContent" in data:
                        server_content = data["serverContent"]

                        if "modelTurn" in server_content:
                            model_turn = server_content["modelTurn"]

                            if "parts" in model_turn:
                                for part in model_turn["parts"]:
                                    if "text" in part:
                                        text_chunk = part["text"]
                                        full_response += text_chunk
                                        print(f"\n💬 テキストチャンク: {text_chunk}")

                        if server_content.get("turnComplete"):
                            print("\n✓ ターン完了")
                            break

                except websockets.exceptions.ConnectionClosed:
                    print("\n接続が閉じられました")
                    break

            print(f"\n{'=' * 60}")
            print("完全な応答")
            print("=" * 60)
            print(full_response)


if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════╗
║     Gemini Live API - ツール実行サンプル                  ║
╚══════════════════════════════════════════════════════════╝
    """)

    try:
        asyncio.run(run_gemini_live_with_tool())
    except Exception as e:
        print(f"\n❌ エラー: {e}")
