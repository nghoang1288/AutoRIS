/**
 * sandbox.js - AutoRIS Sandboxed Execution Environment (Manifest V3)
 * Cho phép thực thi mã ClinicalSynthesizer cập nhật động từ VPS mà không bị chặn bởi MV3 CSP.
 */
(function () {
  "use strict";

  let currentVersion = 0;

  window.addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || !data.action) return;

    // 1. Kiểm tra liveness / handshake
    if (data.action === "PING") {
      event.source.postMessage({ id: data.id, action: "PONG", version: currentVersion }, "*");
      return;
    }

    // 2. Nạp mã JS mới được fetch từ VPS
    if (data.action === "UPDATE_CODE") {
      const { id, code, version } = data;
      try {
        if (!code || typeof code !== "string") {
          throw new Error("Dữ liệu code không hợp lệ");
        }

        // Thực thi code trong sandbox (được phép trong sandbox page của MV3)
        const runner = new Function(code);
        runner();

        if (!window.ClinicalSynthesizer) {
          throw new Error("Mã JS nạp không định nghĩa window.ClinicalSynthesizer");
        }

        currentVersion = version || Date.now();
        console.log(`[AutoRIS Sandbox] ⚡ Đã nạp thành công bộ luật mới (v${currentVersion})!`);

        event.source.postMessage({
          id,
          action: "CODE_UPDATED",
          success: true,
          version: currentVersion
        }, "*");
      } catch (err) {
        console.error("[AutoRIS Sandbox] ❌ Lỗi biên dịch code mới:", err);
        event.source.postMessage({
          id,
          action: "CODE_UPDATED",
          success: false,
          error: err.message
        }, "*");
      }
      return;
    }

    // 3. Thực thi hàm trên ClinicalSynthesizer
    if (data.action === "INVOKE") {
      const { id, method, args } = data;
      try {
        if (!window.ClinicalSynthesizer) {
          throw new Error("ClinicalSynthesizer chưa được khởi tạo trong Sandbox");
        }
        if (typeof window.ClinicalSynthesizer[method] !== "function") {
          throw new Error(`Method '${method}' không tồn tại trên ClinicalSynthesizer`);
        }

        const res = await window.ClinicalSynthesizer[method](...(args || []));
        event.source.postMessage({ id, success: true, result: res }, "*");
      } catch (err) {
        console.error(`[AutoRIS Sandbox] Lỗi thực thi ${method}:`, err);
        event.source.postMessage({ id, success: false, error: err.message }, "*");
      }
    }
  });

  console.log("[AutoRIS Sandbox] Sandbox listener initialized.");
})();
