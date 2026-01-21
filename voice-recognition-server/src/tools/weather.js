/**
 * 天気情報取得ツール
 */

/**
 * 天気情報を取得（シミュレーション）
 * @param {string} location - 場所
 * @returns {Object} - 天気情報
 */
export function getWeather(location) {
  console.log(`🌤️ 天気情報を取得中: ${location}`);

  // 実際のAPIを呼び出す場合は、ここでHTTPリクエストを送信
  // 例: OpenWeatherMap API, WeatherAPI.com など

  // シミュレーションデータを返す
  const weatherConditions = ['晴れ', '曇り', '雨', '雪', '霧'];
  const randomCondition = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
  const temperature = Math.floor(Math.random() * 30) + 5; // 5-35度
  const humidity = Math.floor(Math.random() * 60) + 40; // 40-100%

  const weatherData = {
    location: location,
    condition: randomCondition,
    temperature: temperature,
    humidity: humidity,
    unit: 'celsius',
    timestamp: new Date().toISOString(),
  };

  console.log(`✓ 天気情報取得完了:`, weatherData);

  return {
    success: true,
    data: weatherData,
    message: `${location}の天気は${randomCondition}、気温は${temperature}度、湿度は${humidity}%です。`,
  };
}

/**
 * 天気予報を取得（シミュレーション）
 * @param {string} location - 場所
 * @param {number} days - 予報日数（デフォルト: 3）
 * @returns {Object} - 天気予報
 */
export function getForecast(location, days = 3) {
  console.log(`📅 天気予報を取得中: ${location} (${days}日間)`);

  const forecast = [];
  const weatherConditions = ['晴れ', '曇り', '雨', '雪'];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);

    forecast.push({
      date: date.toISOString().split('T')[0],
      condition: weatherConditions[Math.floor(Math.random() * weatherConditions.length)],
      temperatureHigh: Math.floor(Math.random() * 10) + 20,
      temperatureLow: Math.floor(Math.random() * 10) + 10,
    });
  }

  console.log(`✓ 天気予報取得完了:`, forecast);

  return {
    success: true,
    data: {
      location: location,
      forecast: forecast,
    },
    message: `${location}の${days}日間の天気予報を取得しました。`,
  };
}

/**
 * 天気アラートを取得（シミュレーション）
 * @param {string} location - 場所
 * @returns {Object} - 天気アラート
 */
export function getWeatherAlerts(location) {
  console.log(`⚠️ 天気アラートを確認中: ${location}`);

  // ランダムでアラートを生成
  const hasAlert = Math.random() > 0.7;

  if (!hasAlert) {
    return {
      success: true,
      data: {
        location: location,
        alerts: [],
      },
      message: `${location}に天気アラートはありません。`,
    };
  }

  const alertTypes = ['大雨警報', '強風注意報', '雷注意報', '高温注意報'];
  const alert = {
    type: alertTypes[Math.floor(Math.random() * alertTypes.length)],
    severity: 'moderate',
    description: '気象条件に注意してください。',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6時間後
  };

  return {
    success: true,
    data: {
      location: location,
      alerts: [alert],
    },
    message: `${location}に${alert.type}が発令されています。`,
  };
}

export default {
  getWeather,
  getForecast,
  getWeatherAlerts,
};
