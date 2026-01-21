/**
 * Gemini Live API サンプル (Node.js版)
 * リクエスト → ツール実行 → ストリーム応答のシンプルな例
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// サンプルツール定義: 現在時刻を取得
function getCurrentTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ツール実行関数
function executeTool(functionCall) {
  const toolName = functionCall.name;

  console.log('\n🔧 ツール呼び出し検出!');
  console.log(`   ツール名: ${toolName}`);
  console.log(`   引数:`, functionCall.args);

  if (toolName === 'get_current_time') {
    const result = getCurrentTime();
    console.log(`   実行結果: ${result}`);
    return result;
  }

  return `Unknown tool: ${toolName}`;
}

async function runGeminiLiveWithTool() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 GEMINI_API_KEY を設定してください');
  }

  // 1. クライアント作成
  const genAI = new GoogleGenerativeAI(apiKey);

  // 2. ツール定義
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'get_current_time',
          description: '現在の日時を取得します',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }
  ];

  // 3. モデル取得
  const modelId = 'gemini-2.0-flash-exp';
  console.log(`✓ モデル接続中: ${modelId}\n`);

  const model = genAI.getGenerativeModel({
    model: modelId,
    tools: tools
  });

  // 4. チャットセッション開始
  const chat = model.startChat({
    history: []
  });

  console.log('✓ チャットセッション開始\n');

  // 5. ユーザーメッセージ送信
  const userPrompt = '今の時刻を教えてください';
  console.log('='.repeat(60));
  console.log(`→ ユーザー: ${userPrompt}`);
  console.log('='.repeat(60) + '\n');

  console.log('ストリーム応答受信中...\n');

  // 最初のリクエスト送信（ストリーミング）
  const result = await chat.sendMessageStream(userPrompt);

  let fullText = '';
  const functionCalls = [];

  // 6. ストリーム応答を受信
  for await (const chunk of result.stream) {
    const candidates = chunk.candidates;

    if (candidates && candidates.length > 0) {
      const content = candidates[0].content;

      if (content && content.parts) {
        for (const part of content.parts) {
          // テキスト応答
          if (part.text) {
            console.log(`💬 テキストチャンク: ${part.text}`);
            fullText += part.text;
          }

          // ツール呼び出し
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }
      }
    }
  }

  // ストリーム完了を待つ
  const response = await result.response;
  console.log('\n✓ ストリーム完了');

  // 7. ツール実行とレスポンス送信
  if (functionCalls.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('ツール実行');
    console.log('='.repeat(60));

    // 各ツールを実行して結果を収集
    const functionResponses = [];

    for (const functionCall of functionCalls) {
      const result = executeTool(functionCall);

      functionResponses.push({
        functionResponse: {
          name: functionCall.name,
          response: {
            result: result
          }
        }
      });
    }

    console.log('\n→ ツール実行結果を送信\n');

    // 8. 最終応答をストリームで受信
    console.log('='.repeat(60));
    console.log('最終応答ストリーム受信中...');
    console.log('='.repeat(60) + '\n');

    const finalResult = await chat.sendMessageStream(functionResponses);

    let finalText = '';

    for await (const chunk of finalResult.stream) {
      const candidates = chunk.candidates;

      if (candidates && candidates.length > 0) {
        const content = candidates[0].content;

        if (content && content.parts) {
          for (const part of content.parts) {
            if (part.text) {
              console.log(`💬 テキストチャンク: ${part.text}`);
              finalText += part.text;
            }
          }
        }
      }
    }

    await finalResult.response;
    console.log('\n✓ ストリーム完了');

    console.log('\n' + '='.repeat(60));
    console.log('完全な応答');
    console.log('='.repeat(60));
    console.log(finalText);
  }
}

// メイン実行
if (require.main === module) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Gemini Live API - ツール実行サンプル (Node.js)       ║
╚══════════════════════════════════════════════════════════╝
  `);

  runGeminiLiveWithTool()
    .then(() => {
      console.log('\n✓ 完了');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ エラー:', error.message);
      process.exit(1);
    });
}

module.exports = { runGeminiLiveWithTool };
