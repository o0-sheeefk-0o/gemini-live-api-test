/**
 * ウェイクワード検知器
 * テキストからウェイクワードを検出する
 */

import { config } from './config.js';

export class WakeWordDetector {
  constructor(keywords = config.wakeWord.keywords) {
    this.keywords = keywords;
    this.caseSensitive = config.wakeWord.caseSensitive;
    this.enabled = config.wakeWord.enabled;

    // 検知履歴（デバウンス用）
    this.lastDetectionTime = 0;
    this.debounceMs = 2000; // 2秒以内の重複検知を無視
  }

  /**
   * テキストからウェイクワードを検出
   * @param {string} text - 検出対象のテキスト
   * @returns {boolean} - ウェイクワードが検出されたか
   */
  detect(text) {
    if (!this.enabled || !text) {
      return false;
    }

    const searchText = this.caseSensitive ? text : text.toLowerCase();

    for (const keyword of this.keywords) {
      const searchKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();

      if (searchText.includes(searchKeyword)) {
        // デバウンスチェック
        const now = Date.now();
        if (now - this.lastDetectionTime < this.debounceMs) {
          console.log(`🔇 ウェイクワード検出（デバウンス中）: "${keyword}"`);
          return false;
        }

        this.lastDetectionTime = now;
        console.log(`🎤 ウェイクワード検出: "${keyword}" in "${text}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * ウェイクワードを除去したテキストを返す
   * @param {string} text - 元のテキスト
   * @returns {string} - ウェイクワードを除去したテキスト
   */
  removeWakeWord(text) {
    if (!text) return text;

    let result = text;
    const searchText = this.caseSensitive ? text : text.toLowerCase();

    for (const keyword of this.keywords) {
      const searchKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();
      const index = searchText.indexOf(searchKeyword);

      if (index !== -1) {
        // ウェイクワードとその前後の空白を除去
        result = text.substring(0, index) + text.substring(index + keyword.length);
        result = result.trim();
        break;
      }
    }

    return result;
  }

  /**
   * 検知設定を更新
   * @param {Object} options - 新しい設定
   */
  updateConfig(options) {
    if (options.keywords) {
      this.keywords = options.keywords;
    }
    if (typeof options.caseSensitive === 'boolean') {
      this.caseSensitive = options.caseSensitive;
    }
    if (typeof options.enabled === 'boolean') {
      this.enabled = options.enabled;
    }
  }

  /**
   * デバウンスタイマーをリセット
   */
  resetDebounce() {
    this.lastDetectionTime = 0;
  }
}

export default WakeWordDetector;
