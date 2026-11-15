/*
 * pdd_capture.js — 拼多多 Cookie 抓取
 * 类型：Quantumult X  script-request-header
 *
 * 逻辑：从任意 *.yangkeduo.com / *.pinduoduo.com 请求头里提取关键 Cookie，
 *       拼成一行存进 $prefs["PDD_CK"]，首次或变化时弹通知。
 *
 * 注意：必须调用 $done({})，否则 QX 会让该请求挂起到超时。
 */

var CK_KEY = "PDD_CK";
var WANT = [
  "PDDAccessToken",
  "pdd_user_id",
  "pdd_user_uin",
  "api_uid",
  "_nano_fp",
  "msa",
  "d04",
  "d11"
];

var finished = false;

function finish() {
  if (finished) return;
  finished = true;
  if (typeof $done === "function") $done({});
}

(function () {
  try {
    if (typeof $request === "undefined" || !$request) return;

    var h = $request.headers || {};
    var cookie = h.Cookie || h.cookie || "";
    cookie = String(cookie);
    if (!cookie) return;

    var map = {};
    cookie.split(";").forEach(function (seg) {
      var i = seg.indexOf("=");
      if (i <= 0) return;
      var k = seg.slice(0, i).trim();
      var v = seg.slice(i + 1).trim();
      if (k) map[k] = v;
    });

    var out = [];
    WANT.forEach(function (k) {
      if (map[k]) out.push(k + "=" + map[k]);
    });

    // 关键字段一个都没抓到就不写入，避免把已有数据覆盖成空
    if (!out.length) return;

    var ck = out.join("; ");
    var old = null;
    if (typeof $prefs !== "undefined" && $prefs.valueForKey) {
      try { old = $prefs.valueForKey(CK_KEY); } catch (e) {}
    }
    if (old === ck) return;

    if (typeof $prefs !== "undefined" && $prefs.setValueForKey) {
      try {
        $prefs.setValueForKey(ck, CK_KEY);
        $prefs.setValueForKey(String(Date.now()), CK_KEY + "_TIME");
      } catch (e) {}
    }

    if (typeof $notify === "function") {
      try {
        $notify("拼多多 CK 已更新", "pdd_user_id=" + (map["pdd_user_id"] || "-"),
                "长度 " + ck.length + " 字符");
      } catch (e) {}
    }
    console.log("[PDD_CK] " + ck);
  } catch (e) {
    console.log("[PDD_CK] error: " + e);
  } finally {
    finish();
  }
})();
