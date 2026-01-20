"""
Gemini Live API サンプル (google-genai ライブラリ使用)
リクエスト → ツール実行 → ストリーム応答のシンプルな例
"""

import asyncio
import os
from datetime import datetime
from google import genai


# サンプルツール定義: 現在時刻を取得
def get_current_time():
    """現在時刻を取得するツール"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ツール実行関数
def execute_tool(function_call):
    """ツールを実行して結果を返す"""
    tool_name = function_call.name

    print(f"\n🔧 ツール呼び出し検出!")
    print(f"   ツール名: {tool_name}")
    print(f"   ID: {function_call.id}")

    if tool_name == "get_current_time":
        result = get_current_time()
        print(f"   実行結果: {result}")
        return result

    return f"Unknown tool: {tool_name}"


async def run_gemini_live_with_tool():
    """Gemini Live APIでツールを使用した会話を実行"""

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("環境変数 GEMINI_API_KEY を設定してください")

    # 1. クライアント作成
    client = genai.Client(api_key=api_key)

    # 2. ツール定義
    tools = [
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

    # 3. Live APIセッション開始
    model_id = "gemini-2.0-flash-exp"
    config = {"response_modalities": ["TEXT"]}

    print(f"✓ モデル接続中: {model_id}\n")

    async with client.aio.live.connect(model=model_id, config=config, tools=tools) as session:
        print("✓ Live APIセッション開始\n")

        # 4. ユーザーメッセージ送信
        user_prompt = "今の時刻を教えてください"
        print(f"{'=' * 60}")
        print(f"→ ユーザー: {user_prompt}")
        print(f"{'=' * 60}\n")

        await session.send(user_prompt, end_of_turn=True)

        # 5. ストリーム応答を受信
        print("ストリーム応答受信中...\n")

        full_text = ""
        tool_calls = []

        async for response in session.receive():
            # サーバーからのコンテンツを処理
            if response.server_content:
                model_turn = response.server_content.model_turn

                if model_turn:
                    for part in model_turn.parts:
                        # テキスト応答
                        if part.text:
                            print(f"💬 テキストチャンク: {part.text}")
                            full_text += part.text

                        # ツール呼び出し
                        if hasattr(part, 'function_call') and part.function_call:
                            tool_calls.append(part.function_call)

                # ターン完了チェック
                if response.server_content.turn_complete:
                    print("\n✓ ターン完了")
                    break

        # 6. ツール実行とレスポンス送信
        if tool_calls:
            print(f"\n{'=' * 60}")
            print("ツール実行")
            print(f"{'=' * 60}")

            # 各ツールを実行して結果を送信
            for function_call in tool_calls:
                result = execute_tool(function_call)

                # ツール実行結果を送信
                function_response = {
                    "id": function_call.id,
                    "name": function_call.name,
                    "response": {"result": result}
                }

                await session.send(function_response, end_of_turn=True)
                print(f"\n→ ツール実行結果を送信\n")

            # 7. 最終応答をストリームで受信
            print(f"{'=' * 60}")
            print("最終応答ストリーム受信中...")
            print(f"{'=' * 60}\n")

            final_text = ""

            async for response in session.receive():
                if response.server_content:
                    model_turn = response.server_content.model_turn

                    if model_turn:
                        for part in model_turn.parts:
                            if part.text:
                                print(f"💬 テキストチャンク: {part.text}")
                                final_text += part.text

                    if response.server_content.turn_complete:
                        print("\n✓ ターン完了")
                        break

            print(f"\n{'=' * 60}")
            print("完全な応答")
            print(f"{'=' * 60}")
            print(final_text)


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
