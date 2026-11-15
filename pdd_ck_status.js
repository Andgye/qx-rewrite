/*
 * pdd_ck_status.js —— 拼多多 CK 状态自检（Quantumult X 任务脚本）
 *
 * 用途：任何时候手动跑一次，直接告诉你 token 在不在、多长、多久没更新。
 * 建议加成定时任务：0 9 * * *  （每天 9 点自动体检）
 */

var TOKEN_KEY = "qx_pdd_app_token";
var ANTI_KEY = "qx_pdd_anti_token";
var TIME_KEY = "qx_pdd_app_token_time";

function get(k) {
  try { return $prefs.valueForKey(k); } catch (e) { return null; }
}

(function () {
  try {
    var token = get(TOKEN_KEY) || "";
    var anti = get(ANTI_KEY) || "";
    var t = parseInt(get(TIME_KEY) || "0", 10) || 0;

    if (!token) {
      $notify("拼多多 CK 体检", "❌ 没有 token",
              "打开拼多多 App 逛一圈，再运行本脚本");
      $done();
      return;
    }

    var ageH = t ? Math.round((Date.now() - t) / 36000) / 100 : -1;
    var verdict;
    if (ageH < 0) {
      verdict = "没有时间戳，建议重抓";
    } else if (ageH <= 6) {
      verdict = "状态很好 ✅";
    } else if (ageH <= 24) {
      verdict = "可用，已过 " + ageH + " 小时 ⚠️";
    } else {
      verdict = "偏旧（" + ageH + " 小时），建议打开 App 刷新";
    }

    $notify(
      "拼多多 CK 体检",
      verdict,
      "长度 " + token.length +
        (anti ? " / anti-token 有" : " / anti-token 无") +
        "\n指纹 " + token.slice(0, 6) + "***" + token.slice(-6)
    );
    console.log("[体检] token 长度 " + token.length + " 年龄 " + ageH + "h");
  } catch (e) {
    console.log("[体检] error: " + e);
  } finally {
    if (typeof $done === "function") $done();
  }
})();
