/*
 * pdd_capture.js —— 拼多多果园 AccessToken 捕获
 * 类型：Quantumult X  script-request-header
 *
 * 存储键（与 qx_pdd_app_orchard.js 一致，改了任务就读不到）：
 *   qx_pdd_app_token      ← 请求头 accesstoken
 *   qx_pdd_anti_token     ← 请求头 anti-token
 *   qx_pdd_app_token_time ← 最后捕获时间
 *   qx_pdd_session_time   ← 上次捕获所处"会话"的时间（限流用）
 *
 * 两条规则：
 *   1) 必须同时带 accesstoken 和 anti-token 才写入。
 *      首页/游客请求只有 accesstoken、值是短的匿名 token，
 *      存进去会把果园的真 token 覆盖掉，任务就跑不了了。
 *   2) 每次打开 App 只提醒一次：距上次捕获超过 30 分钟算"新一次打开"，
 *      这才弹窗；同一次使用过程中的几十条请求全部静默。
 */

var TOKEN_KEY = "qx_pdd_app_token";
var ANTI_KEY = "qx_pdd_anti_token";
var TIME_KEY = "qx_pdd_app_token_time";
var SESSION_KEY = "qx_pdd_session_time";
var NOTIFY_KEY = "qx_pdd_notify_time";

var SILENT = false;
var SESSION_GAP_MS = 30 * 60 * 1000;    // 30 分钟算同一次打开
var NOTIFY_GAP_MS = 30 * 60 * 1000;     // 普通变化提醒的最小间隔
var MIN_TOKEN_LEN = 40;                // 太短的多半是匿名 token，直接丢弃

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

function get(k) {
  try { return $prefs.valueForKey(k); } catch (e) { return null; }
}
function set(v, k) {
  try { $prefs.setValueForKey(v, k); } catch (e) {}
}

(function () {
  try {
    if (typeof $request === "undefined" || !$request) return;

    var h = $request.headers || {};
    var token = header(h, "accesstoken");
    var anti = header(h, "anti-token");

    if (!token) return;

    // 已经存过带 anti-token 的果园 token 后，就只认"同样带 anti-token"的请求，
    // 首页/游客请求（只有 accesstoken、值也短）再也覆盖不了它。
    var hasOrchardToken = Boolean(get(ANTI_KEY) || "");
    if (hasOrchardToken && !anti) return;
    if (!hasOrchardToken && token.length < MIN_TOKEN_LEN) return;

    var now = Date.now();
    var oldToken = get(TOKEN_KEY) || "";
    var lastSession = parseInt(get(SESSION_KEY) || "0", 10) || 0;
    var newSession = now - lastSession >= SESSION_GAP_MS;
    var lastNotify = parseInt(get(NOTIFY_KEY) || "0", 10) || 0;

    if (token !== oldToken) {
      set(token, TOKEN_KEY);
      set(anti, ANTI_KEY);
      set(String(now), TIME_KEY);
      console.log("[PDD] 果园 token 更新，长度 " + token.length);
    }

    // 两种情况各提醒一次：
    //   newSession —— 距上次抓取超过 30 分钟，等于又打开了一次 App
    //   upgraded   —— 刚从"没 anti-token"升级成真正的果园 token
    var upgraded = Boolean(anti) && !hasOrchardToken;
    var changedSafely = (token !== oldToken) && Boolean(anti) &&
                        (now - lastNotify >= NOTIFY_GAP_MS);
    if (newSession || upgraded || changedSafely) {
      set(String(now), SESSION_KEY);
      set(String(now), NOTIFY_KEY);
      if (!SILENT && typeof $notify === "function") {
        try {
          if (anti) {
            $notify("拼多多果园 token 已抓取",
                    token.slice(0, 6) + "***" + token.slice(-6),
                    "长度 " + token.length + "，可以跑任务了");
          } else {
            $notify("拼多多 token 已抓到（非果园态）",
                    token.slice(0, 6) + "***" + token.slice(-6),
                    "长度 " + token.length + "，进一次果园会抓得更准");
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.log("[PDD] capture error: " + e);
  } finally {
    finish();
  }
})();
