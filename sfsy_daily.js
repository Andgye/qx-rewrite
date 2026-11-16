/*
 * sfsy_daily.js —— 顺丰速运每日任务（Quantumult X 版）
 *
 * 移植自 linbailo/zyqinglong 的 SFSY.py，保留长期有效的部分：
 *   1. 积分签到（automaticSignFetchPackage）
 *   2. 超值福利签到（superWelfare.receiveRedPacket）
 *   3. 签到任务：查列表 → finishTask → fetchIntegral
 *   4. 采蜜换大礼：indexData → taskDetail → finishTask / receiveHoney
 *   5. 积分、丰蜜汇总
 * 已删除：周年庆集卡、会员日、端午活动、大冒险游戏（接口已下线或需人工）
 *
 * 依赖：$prefs["sfsy_cookie"]（由 sfsy_capture.js 抓取）
 *
 * 建议 cron：11 6,9,12,15,18 * * *
 */

var CK_KEY = "sfsy_cookie";
var HOST = "https://mcs-mimp-web.sf-express.com";
var SIGN_TOKEN = "wwesldfs29aniversaryvdld29";
var SYSCODE = "MCS-MIMP-CORE";
var TIMEOUT = 20000;

/* ---------------- md5 ---------------- */
/* 标准实现，已与 Python hashlib.md5 逐字节比对通过 */
function md5(str) {
  function add32(a, b) { return (a + b) & 0xffffffff; }
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  function hex(n) {
    var out = "", j;
    for (j = 0; j < 4; j++) {
      out += ((n >> (j * 8 + 4)) & 15).toString(16) + ((n >> (j * 8)) & 15).toString(16);
    }
    return out;
  }

  var bytes = utf8(str);
  var n = bytes.length;
  var blocks = ((n + 8) >> 6) + 1;
  var words = [];
  for (var w = 0; w < blocks * 16; w++) words[w] = 0;
  for (var i = 0; i < n; i++) {
    words[i >> 2] |= (bytes.charCodeAt(i) & 0xff) << ((i % 4) << 3);
  }
  words[n >> 2] |= 0x80 << ((n % 4) << 3);
  words[blocks * 16 - 2] = n * 8;

  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  for (var k = 0; k < blocks * 16; k += 16) {
    var oa = a, ob = b, oc = c, od = d;

    a = ff(a, b, c, d, words[k], 7, -680876936);
    d = ff(d, a, b, c, words[k + 1], 12, -389564586);
    c = ff(c, d, a, b, words[k + 2], 17, 606105819);
    b = ff(b, c, d, a, words[k + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[k + 4], 7, -176418897);
    d = ff(d, a, b, c, words[k + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[k + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[k + 7], 22, -45705983);
    a = ff(a, b, c, d, words[k + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[k + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[k + 10], 17, -42063);
    b = ff(b, c, d, a, words[k + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[k + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[k + 13], 12, -40341101);
    c = ff(c, d, a, b, words[k + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[k + 15], 22, 1236535329);

    a = gg(a, b, c, d, words[k + 1], 5, -165796510);
    d = gg(d, a, b, c, words[k + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[k + 11], 14, 643717713);
    b = gg(b, c, d, a, words[k], 20, -373897302);
    a = gg(a, b, c, d, words[k + 5], 5, -701558691);
    d = gg(d, a, b, c, words[k + 10], 9, 38016083);
    c = gg(c, d, a, b, words[k + 15], 14, -660478335);
    b = gg(b, c, d, a, words[k + 4], 20, -405537848);
    a = gg(a, b, c, d, words[k + 9], 5, 568446438);
    d = gg(d, a, b, c, words[k + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[k + 3], 14, -187363961);
    b = gg(b, c, d, a, words[k + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[k + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[k + 2], 9, -51403784);
    c = gg(c, d, a, b, words[k + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[k + 12], 20, -1926607734);

    a = hh(a, b, c, d, words[k + 5], 4, -378558);
    d = hh(d, a, b, c, words[k + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[k + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[k + 14], 23, -35309556);
    a = hh(a, b, c, d, words[k + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[k + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[k + 7], 16, -155497632);
    b = hh(b, c, d, a, words[k + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[k + 13], 4, 681279174);
    d = hh(d, a, b, c, words[k], 11, -358537222);
    c = hh(c, d, a, b, words[k + 3], 16, -722521979);
    b = hh(b, c, d, a, words[k + 6], 23, 76029189);
    a = hh(a, b, c, d, words[k + 9], 4, -640364487);
    d = hh(d, a, b, c, words[k + 12], 11, -421815835);
    c = hh(c, d, a, b, words[k + 15], 16, 530742520);
    b = hh(b, c, d, a, words[k + 2], 23, -995338651);

    a = ii(a, b, c, d, words[k], 6, -198630844);
    d = ii(d, a, b, c, words[k + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[k + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[k + 5], 21, -57434055);
    a = ii(a, b, c, d, words[k + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[k + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[k + 10], 15, -1051523);
    b = ii(b, c, d, a, words[k + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[k + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[k + 15], 10, -30611744);
    c = ii(c, d, a, b, words[k + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[k + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[k + 4], 6, -145523070);
    d = ii(d, a, b, c, words[k + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[k + 2], 15, 718787259);
    b = ii(b, c, d, a, words[k + 9], 21, -343485551);

    a = add32(a, oa); b = add32(b, ob); c = add32(c, oc); d = add32(d, od);
  }
  return hex(a) + hex(b) + hex(c) + hex(d);
}

function utf8(s) {
  /* 转成 UTF-8 字节串；代理对（emoji 等 4 字节字符）也要正确合并 */
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      var c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = ((c - 0xd800) << 10) + (c2 - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c < 0x800) {
      out += String.fromCharCode((c >> 6) | 0xc0);
      out += String.fromCharCode((c & 0x3f) | 0x80);
    } else if (c < 0x10000) {
      out += String.fromCharCode((c >> 12) | 0xe0);
      out += String.fromCharCode(((c >> 6) & 0x3f) | 0x80);
      out += String.fromCharCode((c & 0x3f) | 0x80);
    } else {
      out += String.fromCharCode((c >> 18) | 0xf0);
      out += String.fromCharCode(((c >> 12) & 0x3f) | 0x80);
      out += String.fromCharCode(((c >> 6) & 0x3f) | 0x80);
      out += String.fromCharCode((c & 0x3f) | 0x80);
    }
  }
  return out;
}

/* ---------------- 工具 ---------------- */
var LOGS = [];

function log(line) {
  if (!line) return;
  LOGS.push(line);
  console.log(line);
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function deviceId() {
  var hexs = "abcdef0123456789", out = "", tpl = "xxxxxxxx-xxxx-xxxx";
  for (var i = 0; i < tpl.length; i++) {
    out += tpl[i] === "x" ? hexs[Math.floor(Math.random() * hexs.length)] : tpl[i];
  }
  return out;
}

function parseCookie(str) {
  var jar = {};
  String(str || "").split(";").forEach(function (seg) {
    var i = seg.indexOf("=");
    if (i <= 0) return;
    jar[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  });
  return jar;
}

/* ---------------- 请求 ---------------- */
var COOKIE = "";
var USER_ID = "";

function signHeaders() {
  var ts = String(new Date().getTime());
  var raw = "token=" + SIGN_TOKEN + "&timestamp=" + ts + "&sysCode=" + SYSCODE;
  return { sysCode: SYSCODE, timestamp: ts, signature: md5(raw) };
}

function baseHeaders(extra) {
  var h = {
    "Host": "mcs-mimp-web.sf-express.com",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 " +
                  "(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40 NetType/WIFI Language/zh_CN",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Content-Type": "application/json;charset=UTF-8",
    "platform": "MINI_PROGRAM",
    "Cookie": COOKIE
  };
  var s = signHeaders();
  h.sysCode = s.sysCode;
  h.timestamp = s.timestamp;
  h.signature = s.signature;
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

function post(path, body, extraHeaders) {
  var url = HOST + path;
  var opt = {
    url: url,
    method: "POST",
    headers: baseHeaders(extraHeaders),
    body: JSON.stringify(body || {}),
    timeout: TIMEOUT
  };
  return $task.fetch(opt).then(function (res) {
    var txt = String(res.body || "");
    try {
      return JSON.parse(txt);
    } catch (e) {
      log("解析失败 " + path + " → " + txt.slice(0, 80));
      return null;
    }
  }).catch(function (e) {
    log("请求异常 " + path + " → " + e);
    return null;
  });
}

/* ---------------- 业务 ---------------- */
function stepSign() {
  return post("/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage",
              { comeFrom: "vioin", channelFrom: "WEIXIN" }).then(function (r) {
    if (!r) return "";
    if (r.success === true) {
      var obj = r.obj || {};
      var countDay = (obj.countDay || 0) + 1;
      var list = obj.integralTaskSignPackageVOList;
      if (list && list.length) return "签到成功，得【" + list[0].packetName + "】，本周 " + countDay + " 天";
      return "今日已签到，本周 " + countDay + " 天";
    }
    return "签到失败：" + (r.errorMessage || "未知");
  });
}

function stepSuperWelfare() {
  return post("/mcs-mimp/commonPost/~memberActLengthy~redPacketActivityService~superWelfare~receiveRedPacket",
              { channel: "czflqdlhbxcx" }).then(function (r) {
    if (!r) return "";
    if (r.success === true) {
      var obj = r.obj || {};
      var list = (obj.giftList || []).concat(obj.extraGiftList || []);
      var names = list.map(function (g) { return g.giftName; }).join("、");
      return "超值福利 " + (obj.receiveStatus === 1 ? "领取成功" : "已领过") + (names ? "：" + names : "");
    }
    return "";
  });
}

function stepSignTasks() {
  var body = { channelType: "3", deviceId: deviceId() };
  return post("/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES",
              body).then(function (r) {
    if (!r || r.success !== true || !r.obj) return { done: 0, point: null };
    var tasks = r.obj.taskTitleLevels || [];
    var point = r.obj.totalPoint;
    var pending = tasks.filter(function (t) {
      return t.status !== 3 && ["用行业模板寄件下单", "去新增一个收件偏好", "参与积分活动"].indexOf(t.title) < 0;
    });
    // 串行执行，避免并发触发风控
    return pending.reduce(function (p, t) {
      return p.then(function (acc) {
        return post("/mcs-mimp/commonRoutePost/memberEs/taskRecord/finishTask", { taskCode: t.taskCode })
          .then(function (r1) {
            return sleep(1200).then(function () {
              return post("/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~fetchIntegral",
                          { strategyId: t.strategyId, taskId: t.taskId, taskCode: t.taskCode, deviceId: deviceId() })
                .then(function (r2) {
                  if (r2 && r2.success === true) {
                    acc.done++;
                    log("任务完成并领奖：" + t.title);
                  }
                  return acc;
                });
            });
          });
      });
    }, Promise.resolve({ done: 0, point: point })).then(function (acc) {
      return sleep(1000).then(function () {
        return post("/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES",
                    { channelType: "3", deviceId: deviceId() }).then(function (r3) {
          acc.point = (r3 && r3.success === true && r3.obj) ? r3.obj.totalPoint : acc.point;
          return acc;
        });
      });
    });
  });
}

function stepHoney() {
  var invite = "8C3950A023D942FD93BE9218F5BFB34B";
  var ch = { channel: "wxwdsj" };
  return post("/mcs-mimp/commonPost/~memberNonactivity~receiveExchangeIndexService~indexData",
              { inviteUserId: invite }, ch).then(function (r) {
    var before = (r && r.success === true && r.obj) ? r.obj.usableHoney : null;

    return post("/mcs-mimp/commonPost/~memberNonactivity~receiveExchangeIndexService~taskDetail", {}, ch)
      .then(function (t) {
        var list = (t && t.success === true && t.obj && t.obj.list) || [];
        var todo = list.filter(function (x) { return x.status !== 3 && x.taskCode; });
        if (!todo.length) return null;

        return todo.reduce(function (p, item) {
          return p.then(function () {
            var pc = item.taskType === "DAILY_VIP_TASK_TYPE"
              ? Promise.resolve(null)
              : post("/mcs-mimp/commonPost/~memberEs~taskRecord~finishTask", { taskCode: item.taskCode }, ch);
            return pc.then(function () {
              return sleep(1200);
            }).then(function () {
              return post("/mcs-mimp/commonPost/~memberNonactivity~receiveExchangeIndexService~receiveHoney",
                          { taskType: item.taskType }, ch).then(function (rr) {
                if (rr && rr.success === true) log("采蜜任务完成：" + item.taskType);
                return null;
              });
            });
          });
        }, Promise.resolve()).then(function () {
          return post("/mcs-mimp/commonPost/~memberNonactivity~receiveExchangeIndexService~indexData",
                      { inviteUserId: invite }, ch).then(function (r2) {
            return (r2 && r2.success === true && r2.obj) ? r2.obj.usableHoney : before;
          });
        });
      }).then(function (after) {
        return post("/mcs-mimp/commonPost/~memberNonactivity~receiveExchangeIndexService~indexData",
                    { inviteUserId: invite }, ch).then(function (r3) {
          return (r3 && r3.success === true && r3.obj) ? r3.obj.usableHoney : after;
        });
      });
  });
}

/* ---------------- 入口 ---------------- */
(function () {
  var cookie = "";
  try { cookie = $prefs.valueForKey(CK_KEY) || ""; } catch (e) { cookie = ""; }

  if (!cookie) {
    $notify("顺丰速运", "❌ 没有 Cookie", "先打开顺丰 App 抓一次，或检查 sfsy_capture.js 是否生效");
    $done();
    return;
  }

  COOKIE = cookie;
  var jar = parseCookie(cookie);
  USER_ID = jar._login_user_id_ || "";
  var mobile = jar._login_mobile_ || "";
  var maskMid = mobile.length >= 7 ? mobile.slice(0, 3) + "****" + mobile.slice(7) : "";

  var start = Date.now();
  sleep(1000 + Math.floor(Math.random() * 2000))
    .then(function () { return stepSign(); })
    .then(function (r) { if (r) log(r); return stepSuperWelfare(); })
    .then(function (r) { if (r) log(r); return stepSignTasks(); })
    .then(function (info) {
      log("签到任务：" + (info.done || 0) + " 个完成");
      if (info.point !== null && info.point !== undefined) log("当前积分：" + info.point);
      return stepHoney();
    })
    .then(function (honey) {
      if (honey !== null && honey !== undefined) log("当前丰蜜：" + honey);
    })
    .catch(function (e) {
      log("执行异常：" + e);
    })
    .then(function () {
      var cost = ((Date.now() - start) / 1000).toFixed(1);
      var body = (maskMid ? "账号 " + maskMid + "\n" : "") + LOGS.join("\n") + "\n耗时 " + cost + "s";
      if (body.length > 900) body = body.slice(0, 900) + "…";
      $notify("顺丰速运", LOGS.length > 0 ? "任务执行完成" : "无返回结果", body);
      $done();
    });
})();
