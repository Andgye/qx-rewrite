/*
 * pdd_capture.js —— 拼多多 AccessToken / anti-token 捕获
 * 类型：Quantumult X  script-request-header
 *
 * 存储键（必须与 qx_pdd_app_orchard.js 一致）：
 *   qx_pdd_app_token       ← 请求头 accesstoken
 *   qx_pdd_anti_token      ← 请求头 anti-token
 *   qx_pdd_notify_time     ← 上次弹窗时间（限流用）
 *
 * 通知策略：token 变了才写库；但弹窗最多每 30 分钟一次，
 * 避免拼多多每次请求都带不同 token 导致通知刷屏。
 * 想彻底静音：把 SILENT 改成 true。
 */

var TOKEN_KEY = "qx_pdd_app_token";
var ANTI_KEY = "qx_pdd_anti_token";
var TIME_KEY = "qx_pdd_app_token_time";
var NOTIFY_KEY = "qx_pdd_notify_time";

var SILENT = false;
var NOTIFY_GAP_MS = 30 * 60 * 1000;   // 30 分钟

function header(headers, name) {
  if (!headers) return "";
  var target = String(name).toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === target) {
      var v = headers[keys[i]];
      return Array.isArray(v) ? v.join("") : String(v === undefined || v === null ? "" : v);
    }
  }
  return "";
}

var finished = false;
function finish() {
  if (finished) return;
  finished = true;
  if (typeof $done === "function") $done({});
}

function get(key) {
  try { return $prefs.valueForKey(key); } catch (e) { return null; }
}
function set(value, key) {
  try { $prefs.setValueForKey(value, key); } catch (e) {}
}

(function () {
  try {
    if (typeof $request === "undefined" || !$request) return;

    var headers = $request.headers || {};
    var token = header(headers, "accesstoken");
    var anti = header(headers, "anti-token");

    if (!token) return;

    var now = Date.now();
    var old = get(TOKEN_KEY) || "";

    if (token !== old) {
      set(token, TOKEN_KEY);
      set(String(now), TIME_KEY);

      var lastNotify = parseInt(get(NOTIFY_KEY) || "0", 10) || 0;
      if (!SILENT && now - lastNotify >= NOTIFY_GAP_MS) {
        set(String(now), NOTIFY_KEY);
        if (typeof $notify === "function") {
          try {
            $notify("拼多多 AccessToken 已更新",
                    token.slice(0, 6) + "***" + token.slice(-6),
                    "长度 " + token.length);
          } catch (e) {}
        }
      }
      console.log("[PDD] token 更新，长度 " + token.length);
    }

    if (anti) {
      var oldAnti = get(ANTI_KEY) || "";
      if (anti !== oldAnti) {
        set(anti, ANTI_KEY);
        console.log("[PDD] anti-token 更新");
      }
    }
  } catch (e) {
    console.log("[PDD] capture error: " + e);
  } finally {
    finish();
  }
})();
