/**
 * 資源包自動處理模組
 * 自動接受伺服器發送的資源包請求
 */

class ResourcePackHandler {
  constructor(bot, options = {}) {
    this.bot = bot
    this.options = {
      autoAccept: true, // 自動接受資源包（非強制）
      autoAcceptForced: true, // 自動接受強制資源包
      logPackets: true, // 記錄資源包請求
      ...options
    }

    this.packetHistory = []
    this.isEnabled = false

    // 使用 bot.logger (如果存在) 或 console 作為備援
    this._log = (level, ...args) => {
      if (this.bot && this.bot.logger && this.bot.logger[level]) {
        this.bot.logger[level](`[ResourcePack]`, ...args); // Add prefix
      } else if (level === 'error') {
        console.error(`[ResourcePack]`, ...args); // Add prefix
      } else {
        console.log(`[ResourcePack]`, ...args); // Add prefix
      }
    };
  }

  /**
   * 啟用資源包自動接受功能
   */
  enable() {
    if (this.isEnabled) {
      this._log('info', '已經啟用')
      return
    }

    this._log('info', '正在註冊資源包事件監聽器...')

    // 1.20.3+ 使用 add_resource_pack
    this.bot._client.on('add_resource_pack', (packet) => {
      this._log('info', '⚡ 捕獲到 add_resource_pack 封包（1.20.3+）！')
      this.handleResourcePackRequest(packet)
    })

    // 舊版本使用 resource_pack_send
    this.bot._client.on('resource_pack_send', (packet) => {
      this._log('info', '⚡ 捕獲到 resource_pack_send 封包（舊版）！')
      this.handleResourcePackRequest(packet)
    })

    this.isEnabled = true
    this._log('info', '資源包自動接受已啟用')
    this._log('info', '已註冊事件: add_resource_pack (1.20.3+), resource_pack_send (舊版)')
  }

  /**
   * 停用資源包自動接受功能
   */
  disable() {
    if (!this.isEnabled) {
      this._log('info', '已經停用')
      return
    }

    this.bot._client.removeAllListeners('add_resource_pack')
    this.bot._client.removeAllListeners('resource_pack_send')
    this.isEnabled = false
    this._log('info', '資源包自動接受已停用')
  }

  /**
   * 處理資源包請求
   */
  handleResourcePackRequest(packet) {
    if (this.options.logPackets) {
      this._log('info', '收到資源包請求:')
      this._log('info', `  URL: ${packet.url || 'N/A'}`)
      this._log('info', `  Hash: ${packet.hash || 'N/A'}`)
      this._log('info', `  Forced: ${packet.forced || false}`)
      this._log('info', `  Prompt Message: ${packet.promptMessage || 'N/A'}`)
    }

    // 記錄到歷史
    this.packetHistory.push({
      timestamp: Date.now(),
      url: packet.url,
      hash: packet.hash,
      forced: packet.forced,
      promptMessage: packet.promptMessage
    })

    // 保持最多10條歷史記錄
    if (this.packetHistory.length > 10) {
      this.packetHistory.shift()
    }

    // 根據是否為強制資源包以及設定決定是否自動接受
    let shouldAutoAccept = false;
    if (packet.forced) {
        shouldAutoAccept = this.options.autoAcceptForced;
        this._log('info', `這是一個強制資源包。自動接受設定 (autoAcceptForced): ${this.options.autoAcceptForced}`);
    } else {
        shouldAutoAccept = this.options.autoAccept;
        this._log('info', `這是一個非強制資源包。自動接受設定 (autoAccept): ${this.options.autoAccept}`);
    }

    if (shouldAutoAccept) {
      // 使用 setImmediate 確保在下一個事件循環中處理
      // 這樣可以避免某些插件（如 Nexo）的時序問題
      setImmediate(() => {
        this.acceptResourcePack(packet)
      })
    } else {
        this._log('info', '根據設定，資源包未被自動接受。')
    }
  }

  /**
   * 接受資源包
   */
  acceptResourcePack(packet) {
      try {
          // 狀態代碼（方便你自己記）：
          // 0 - successfully_loaded (成功載入)  ✅ 最終 OK 狀態（最安全）
          // 1 - declined           (拒絕)
          // 2 - failed_download    (下載失敗)
          // 3 - accepted           (已接受)
          // 4 - downloaded         (已下載)      ⚠ 插件未必處理
          // 5 - invalid_url        (無效URL)
          // 6 - failed_reload      (重載失敗)
          // 7 - discarded          (已丟棄)

          const uuid = packet.uuid || packet.UUID     // 1.20.3+ 有 UUID
          const hasUuid = !!uuid

          // 小工具：統一從這裡送封包，順便 log
          const sendReceive = (data) => {
              this.bot._client.write('resource_pack_receive', data)
              this._log('debug', '[ResourcePack] 已送出 resource_pack_receive:', JSON.stringify(data))
          }

          if (hasUuid) {
              // ─────────────────────────────────────
              // 1.20.3+ UUID 流程（多資源包）
              // ─────────────────────────────────────
              this._log('info', '📥 處理資源包請求 (新版 1.20.3+ UUID 流程)')

              // 步驟 1: 發送 accepted (已接受)
              sendReceive({
                  uuid,
                  result: 3 // accepted
              })
              this._log('info', '✓ 已接受資源包 (accepted=3)')

              // 步驟 2 & 3：模擬下載 + 載入完成
              setTimeout(() => {
                  try {
                      // 如果你真的想送 downloaded，可以打開這一段
                      // sendReceive({
                      //   uuid,
                      //   result: 4 // downloaded
                      // })
                      // this._log('info', '✓ 資源包下載完成 (downloaded=4)')

                      setTimeout(() => {
                          try {
                              sendReceive({
                                  uuid,
                                  result: 0 // successfully_loaded
                              })
                              this._log('info', '✅ 資源包載入完成 (successfully_loaded=0)')
                          } catch (error) {
                              this._log('error', '發送載入完成狀態失敗:', error.message)
                          }
                      }, 80) // 模擬載入時間

                  } catch (error) {
                      this._log('error', '發送下載完成狀態失敗:', error.message)
                  }
              }, 80) // 模擬下載時間

          } else {
              // ─────────────────────────────────────
              // 舊版流程（沒有 UUID，只給 hash）
              // ─────────────────────────────────────
              this._log('info', '📥 處理資源包請求 (舊版無 UUID 流程)')

              const payload = {
                  hash: packet.hash || '',
                  result: 0 // successfully_loaded
              }

              sendReceive(payload)
              this._log('info', '✅ 舊版資源包已標記為成功載入 (result=0)')
          }

      } catch (error) {
          this._log('error', '接受資源包時發生錯誤:', error.message)
          this._log('error', '封包內容:', JSON.stringify(packet, null, 2))
      }
  }

    /**
   * 拒絕資源包
   */
  declineResourcePack() {
    try {
      this.bot._client.write('resource_pack_receive', {
        result: 1 // 1 = Declined (拒絕)
      })
      this._log('info', '❌ 已拒絕資源包')
    } catch (error) {
      this._log('error', '拒絕資源包時發生錯誤:', error.message)
    }
  }

  /**
   * 報告下載失敗
   */
  reportDownloadFailed() {
    try {
      this.bot._client.write('resource_pack_receive', {
        result: 2 // 2 = Failed download (下載失敗)
      })
      this._log('warn', '⚠️ 已報告資源包下載失敗')
    } catch (error) {
      this._log('error', '報告下載失敗時發生錯誤:', error.message)
    }
  }

  /**
   * 獲取資源包請求歷史
   */
  getHistory() {
    return this.packetHistory
  }

  /**
   * 獲取最後一次資源包請求
   */
  getLastRequest() {
    return this.packetHistory[this.packetHistory.length - 1] || null
  }

  /**
   * 清除歷史記錄
   */
  clearHistory() {
    this.packetHistory = []
    this._log('info', '歷史記錄已清除')
  }

  /**
   * 獲取狀態
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      autoAccept: this.options.autoAccept,
      autoAcceptForced: this.options.autoAcceptForced,
      historyCount: this.packetHistory.length,
      lastRequest: this.getLastRequest()
    }
  }

  /**
   * 設定自動接受
   */
  setAutoAccept(enabled) {
    this.options.autoAccept = enabled
    this._log('info', `自動接受已${enabled ? '啟用' : '停用'}`)
  }

  /**
   * 設定自動接受強制資源包
   * @param {boolean} enabled - 是否啟用自動接受強制資源包
   */
  setAutoAcceptForced(enabled) {
    this.options.autoAcceptForced = enabled
    this._log('info', `自動接受強制資源包已${enabled ? '啟用' : '停用'}`)
  }
}

module.exports = ResourcePackHandler