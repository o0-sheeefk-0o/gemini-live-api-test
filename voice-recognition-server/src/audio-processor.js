/**
 * 音声データ処理・バッファリング
 */

import { config } from './config.js';

export class AudioProcessor {
  constructor() {
    this.sampleRate = config.audio.sampleRate;
    this.channels = config.audio.channels;
    this.bitDepth = config.audio.bitDepth;
    this.mimeType = config.audio.mimeType;

    // 音声バッファ
    this.buffer = [];
    this.maxBufferSize = 1024 * 1024; // 1MB

    // 統計情報
    this.stats = {
      totalBytes: 0,
      chunksReceived: 0,
      chunksProcessed: 0,
    };
  }

  /**
   * 音声データを追加
   * @param {Buffer|Uint8Array} audioData - 音声データ
   */
  addAudioData(audioData) {
    if (!audioData || audioData.length === 0) {
      return;
    }

    this.buffer.push(audioData);
    this.stats.totalBytes += audioData.length;
    this.stats.chunksReceived++;

    // バッファサイズチェック
    if (this.getBufferSize() > this.maxBufferSize) {
      console.warn('⚠️ Audio buffer overflow, dropping oldest chunk');
      this.buffer.shift();
    }
  }

  /**
   * バッファから音声データを取得
   * @param {boolean} clear - 取得後にバッファをクリアするか
   * @returns {Buffer|null} - 結合された音声データ
   */
  getAudioData(clear = false) {
    if (this.buffer.length === 0) {
      return null;
    }

    // 全てのチャンクを結合
    const totalLength = this.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = Buffer.concat(this.buffer, totalLength);

    this.stats.chunksProcessed++;

    if (clear) {
      this.clearBuffer();
    }

    return combined;
  }

  /**
   * バッファをクリア
   */
  clearBuffer() {
    this.buffer = [];
  }

  /**
   * 現在のバッファサイズを取得（バイト）
   * @returns {number}
   */
  getBufferSize() {
    return this.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  /**
   * 音声データを検証
   * @param {Buffer|Uint8Array} audioData - 音声データ
   * @returns {boolean} - 有効かどうか
   */
  validateAudioData(audioData) {
    if (!audioData || audioData.length === 0) {
      return false;
    }

    // 最小サイズチェック（少なくとも1サンプル分）
    const minSize = (this.bitDepth / 8) * this.channels;
    if (audioData.length < minSize) {
      console.warn(`⚠️ Audio data too small: ${audioData.length} bytes`);
      return false;
    }

    return true;
  }

  /**
   * 音声データをPCM形式に変換（既にPCMの場合はそのまま返す）
   * @param {Buffer|Uint8Array} audioData - 音声データ
   * @returns {Buffer}
   */
  toPCM(audioData) {
    // 既にBufferの場合はそのまま返す
    if (Buffer.isBuffer(audioData)) {
      return audioData;
    }

    // Uint8Arrayの場合はBufferに変換
    if (audioData instanceof Uint8Array) {
      return Buffer.from(audioData);
    }

    // その他の場合は変換を試みる
    return Buffer.from(audioData);
  }

  /**
   * 統計情報を取得
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.getBufferSize(),
      bufferedChunks: this.buffer.length,
    };
  }

  /**
   * 統計情報をリセット
   */
  resetStats() {
    this.stats = {
      totalBytes: 0,
      chunksReceived: 0,
      chunksProcessed: 0,
    };
  }

  /**
   * 音声データのメタ情報を取得
   * @returns {Object}
   */
  getAudioConfig() {
    return {
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitDepth: this.bitDepth,
      mimeType: this.mimeType,
    };
  }
}

export default AudioProcessor;
