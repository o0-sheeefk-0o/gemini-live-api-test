/**
 * ツール定義・実行マネージャー
 */

import { getWeather, getForecast, getWeatherAlerts } from "./weather.js";
import { GoogleGenAI, Modality, Behavior } from "@google/genai";

/**
 * Gemini Live APIに渡すツール定義
 * @returns {Array} - ツール定義配列
 */
export function getToolDefinitions() {
  return [
    {
      functionDeclarations: [
        {
          name: "get_weather",
          behavior: Behavior.NON_BLOCKING,
          description: "指定された場所の現在の天気情報を取得します",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "天気を知りたい場所（例: 東京、大阪、New York）",
              },
            },
            required: ["location"],
          },
        },
        {
          name: "get_forecast",
          behavior: Behavior.NON_BLOCKING,
          description: "指定された場所の天気予報を取得します",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "天気予報を知りたい場所",
              },
              days: {
                type: "number",
                description: "予報日数（1-7日、デフォルト: 3）",
              },
            },
            required: ["location"],
          },
        },
        {
          name: "get_weather_alerts",
          behavior: Behavior.NON_BLOCKING,
          description: "指定された場所の天気アラート・警報情報を取得します",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "天気アラートを確認したい場所",
              },
            },
            required: ["location"],
          },
        },
      ],
    },
  ];
}

/**
 * ツールを実行
 * @param {Object} functionCall - Geminiから受け取ったfunction call
 * @returns {Object} - ツール実行結果
 */
export function executeTool(functionCall) {
  const toolName = functionCall.name;
  const args = functionCall.args || {};

  console.log(`\n🔧 ツール実行: ${toolName}`);
  console.log(`   引数:`, args);

  try {
    let result;

    switch (toolName) {
      case "get_weather":
        result = getWeather(args.location);
        break;

      case "get_forecast":
        result = getForecast(args.location, args.days || 3);
        break;

      case "get_weather_alerts":
        result = getWeatherAlerts(args.location);
        break;

      default:
        console.error(`❌ 未知のツール: ${toolName}`);
        result = {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }

    console.log(`✓ ツール実行完了: ${toolName}`);
    return result;
  } catch (error) {
    console.error(`❌ ツール実行エラー: ${toolName}`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * ツール実行結果をGemini Live API用のフォーマットに変換
 * @param {Object} functionCall - function call
 * @param {Object} result - ツール実行結果
 * @returns {Object} - Gemini Live API用のフォーマット
 */
export function formatToolResponse(functionCall, result) {
  return {
    functionResponse: {
      name: functionCall.name,
      response: {
        result: result,
      },
    },
  };
}

/**
 * 複数のツールを実行
 * @param {Array} functionCalls - function call配列
 * @returns {Array} - フォーマット済みのツール実行結果配列
 */
export async function executeTools(functionCalls) {
  const results = [];

  for (const functionCall of functionCalls) {
    const result = executeTool(functionCall);
    const formatted = formatToolResponse(functionCall, result);
    results.push(formatted);
  }

  return results;
}

export default {
  getToolDefinitions,
  executeTool,
  formatToolResponse,
  executeTools,
};
