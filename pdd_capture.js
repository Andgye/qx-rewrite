/*
 * pdd_capture.js —— 拼多多 AccessToken / anti-token 捕获
 * 类型：Quantumult X  script-request-header
 *
 * 存储键（必须与 qx_pdd_app_orchard.js 一致）：
 *   qx_pdd_app_token    ← 请求头 accesstoken
 *   qx_pdd_anti_token   ← 请求头 anti-token
 *   qx_pdd_app_token_time ← 上次刷新时间
 *   qx_pdd_notify_time  ← 上次弹窗时间（限流）
 *   qx_pdd_beat_time    ← 上次心跳时间
 *
 * 通知策略（三种，防止刷屏又不会“静默失联”）：
 *   1. token 变化       → 弹窗，但 30 分钟内最多一次
 *   2. token 未变化     → 每 24 小时弹一次心跳，证明脚本还活着
 *   3. SILENT = true    → 全部静音
 */

var TOKEN_KEY = "qx_pdd_app_token";
var ANTI_KEY = "qx_pdd_anti_token";
var TIME_KEY = "qx_pdd_app_token_time";
var NOTIFY_KEY = "qx_pdd_notify_time";
var BEAT_KEY = "qx_pdd_beat_time";

var SILENT = false;
var NOTIFY_GAP_MS = 30 * 60 * 1000;      // token 变化：30 分钟一次
var BEAT_GAP_MS = 24 * 60 * 60 * 1000;   // 心跳：24 小时一次

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
function notify(title, sub, body) {
  if (SILENT) return;
  try {
    if (typeof $notify === "function") $notify(title, sub, body);
  } catch (e) {}
}
function hours(ms) {
  return Math.round(ms / 3600000 * 10) / 10;
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
      if (now - lastNotify >= NOTIFY_GAP_MS) {
        set(String(now), NOTIFY_KEY);
        set(String(now), BEAT_KEY);
        notify("拼多多 token 已刷新",
               token.slice(0, 6) + "***" + token.slice(-6),
               "长度 " + token.length + "，任务可以直接跑");
      }
      console.log("[PDD] token 更新，长度 " + token.length);
    } else {
      // 值没变也要有个"我还活着"的信号
      var lastBeat = parseInt(get(BEAT_KEY) || "0", 10) || 0;
      if (now - lastBeat >= BEAT_GAP_MS) {
        set(String(now), BEAT_KEY);
        var age = parseInt(get(TIME_KEY) || "0", 10) || 0;
        notify("拼多多抓取正常（心跳）",
               "token 未变化，已 " + (age ? hours(now - age) : "?") + " 小时",
               "长度 " + token.length + "，无需处理");
      }
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
