/*
 * pdd_capture.js —— 拼多多 App 抓 Cookie（Quantumult X script-request-header）
 * 抓到后存入 $prefs["PDD_COOKIE"]，并弹通知
 */
(function () {
  var CK_KEY = "PDD_COOKIE";
  var KEY_LIST = ["PDDAccessToken", "pdd_user_id", "pdd_user_uin", "api_uid", "_nano_fp", "msa", "d04", "d11"];

  try {
    if (typeof $request === "undefined" || !$request) return;
    var h = $request.headers || {};
    var ck = h.Cookie || h.cookie || "";
    if (!ck) return;

    var map = {};
    ck.split(";").forEach(function (p) {
      var i = p.indexOf("=");
      if (i < 0) return;
      map[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });

    var out = [];
    KEY_LIST.forEach(function (k) {
      if (map[k]) out.push(k + "=" + map[k]);
    });
    if (!out.length) return;

    var finalCk = out.join("; ");

    var old = (typeof $prefs !== "undefined") ? $prefs.valueForKey(CK_KEY) : null;
    if (old === finalCk) return;

    if (typeof $prefs !== "undefined") $prefs.setValueForKey(finalCk, CK_KEY);

    if (typeof $notify !== "undefined") {
      $notify("拼多多抓CK", "Cookie 已更新",
        "pdd_user_id=" + (map["pdd_user_id"] || "-") + "\n长度=" + finalCk.length);
    }
    if (typeof console !== "undefined" && console.log) console.log("[PDD_CK] " + finalCk);
  } catch (e) {}
})();
//（注：内容由AI生成）