/*
 * 电信营业厅登录态捕获（Quantumult X）
 *
 * 只保存经过 MITM 的 189.cn 请求中已有登录态，不保存服务密码。
 * 存储键：qx_telecom_auth
 */

var AUTH_KEY = "qx_telecom_auth";
var NOTIFY_KEY = "qx_telecom_notify_time";
var STATUS_KEY = "qx_telecom_status";
var NOTIFY_GAP_MS = 30 * 60 * 1000;
var STATUS_GAP_MS = 60 * 60 * 1000;

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function headerValue(headers, name) {
  if (!headers) return "";
  var target = String(name).toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() !== target) continue;
    var value = headers[keys[i]];
    if (Array.isArray(value)) return value.join(", ");
    return value === undefined || value === null ? "" : String(value);
  }
  return "";
}

function parseCookie(text) {
  var jar = {};
  String(text || "").split(";").forEach(function (part) {
    var item = part.trim();
    var pos = item.indexOf("=");
    if (pos <= 0) return;
    jar[item.slice(0, pos)] = item.slice(pos + 1);
  });
  return jar;
}

function cookieToString(jar) {
  return Object.keys(jar)
    .map(function (key) {
      return key + "=" + jar[key];
    })
    .join("; ");
}

function mergeCookie(base, incoming) {
  var result = parseCookie(base);
  var next = parseCookie(incoming);
  Object.keys(next).forEach(function (key) {
    result[key] = next[key];
  });
  return cookieToString(result);
}

function mergeSetCookie(base, values) {
  var cookie = String(base || "");
  values.forEach(function (raw) {
    String(raw || "")
      .split(/,(?=\s*[^=;,]+=)/)
      .forEach(function (line) {
        var first = line.split(";")[0].trim();
        var pos = first.indexOf("=");
        if (pos <= 0) return;
        var name = first.slice(0, pos);
        var value = first.slice(pos + 1);
        var jar = parseCookie(cookie);
        if (value) jar[name] = value;
        else delete jar[name];
        cookie = cookieToString(jar);
      });
  });
  return cookie;
}

function hostFromURL(url) {
  var match = String(url || "").match(/^https?:\/\/([^/:?#]+)/i);
  return match ? match[1].toLowerCase() : "";
}

function queryValue(url, name) {
  var match = String(url || "").match(
    new RegExp("[?&]" + name + "=([^&#]+)", "i")
  );
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

function normalizePhone(value) {
  var text = String(value || "").trim();
  if (/^1[3-9]\d{9}$/.test(text)) return text;

  var shifted = text
    .replace(/[^\x20-\x7e]/g, "")
    .split("")
    .map(function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 2);
    })
    .join("");
  if (/^1[3-9]\d{9}$/.test(shifted)) return shifted;
  return "";
}

function findPhoneInText(value) {
  var text = String(value || "");
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      text = decodeURIComponent(text);
    } catch (error) {}
  }
  var direct = text.match(/1[3-9]\d{9}/);
  if (direct) return direct[0];
  if (/^[\[{]/.test(text)) {
    try {
      return findPhone(JSON.parse(text), 0);
    } catch (error) {}
  }
  return "";
}

var PHONE_FIELDS = [
  "phone",
  "phoneNum",
  "mobile",
  "mobileNum",
  "userLoginName",
  "loginName",
  "account",
];

function findPhone(value, depth) {
  if (!value || depth > 5) return "";
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var fromArray = findPhone(value[i], depth + 1);
      if (fromArray) return fromArray;
    }
    return "";
  }
  if (typeof value !== "object") return "";

  for (var i = 0; i < PHONE_FIELDS.length; i++) {
    var field = PHONE_FIELDS[i];
    if (value[field]) {
      var phone = normalizePhone(value[field]);
      if (phone) return phone;
    }
  }
  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j++) {
    if (keys[j] === "password" || keys[j] === "authentication") continue;
    var nested = findPhone(value[keys[j]], depth + 1);
    if (nested) return nested;
  }
  return "";
}

function parseBodyMetadata(body) {
  if (!body) return { phone: "", token: "", userId: "", sign: "" };
  var parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      return {
        phone: normalizePhone(body),
        token: "",
        userId: "",
        sign: "",
      };
    }
  }
  return {
    phone: findPhone(parsed, 0),
    token: findNamedValue(parsed, ["token", "accessToken", "loginToken"], 0),
    userId: findNamedValue(parsed, ["userId", "userID", "uid"], 0),
    sign: findNamedValue(parsed, ["sign"], 0),
  };
}

function findNamedValue(value, names, depth) {
  if (!value || depth > 7) return "";
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var fromArray = findNamedValue(value[i], names, depth + 1);
      if (fromArray) return fromArray;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  for (var i = 0; i < names.length; i++) {
    var candidate = value[names[i]];
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate);
    }
  }
  var keys = Object.keys(value);
  for (var j = 0; j < keys.length; j++) {
    var nested = findNamedValue(value[keys[j]], names, depth + 1);
    if (nested) return nested;
  }
  return "";
}

function mergeHost(previous, host, values) {
  var current = previous.hosts && previous.hosts[host] ? previous.hosts[host] : {};
  var next = Object.assign({}, current);
  Object.keys(values).forEach(function (key) {
    if (values[key] !== "" && values[key] !== null && values[key] !== undefined) {
      next[key] = values[key];
    }
  });
  next.capturedAt = Date.now();
  previous.hosts[host] = next;
}

function captureEvent(event, previousAuth) {
  var auth = clone(previousAuth);
  auth.hosts = auth.hosts || {};
  var request = event && event.request ? event.request : null;
  var response = event && event.response ? event.response : null;
  var url = String((request && request.url) || (response && response.url) || "");
  var host = hostFromURL(url);
  if (!host) return auth;

  var requestHeaders = (request && request.headers) || {};
  var responseHeaders = (response && response.headers) || {};
  var body = request
    ? parseBodyMetadata(request.body)
    : { phone: "", token: "", userId: "", sign: "" };
  if (response && response.body) {
    var responseBody = parseBodyMetadata(response.body);
    if (!body.phone && responseBody.phone) body.phone = responseBody.phone;
    if (!body.token && responseBody.token) body.token = responseBody.token;
    if (!body.userId && responseBody.userId) body.userId = responseBody.userId;
    if (!body.sign && responseBody.sign) body.sign = responseBody.sign;
  }
  var headerPhone = [
    headerValue(requestHeaders, "x-user-phone"),
    headerValue(requestHeaders, "x-mobile"),
    headerValue(requestHeaders, "userloginname"),
    headerValue(requestHeaders, "loginname"),
    queryValue(url, "phone"),
    queryValue(url, "mobile"),
  ]
    .map(normalizePhone)
    .find(Boolean);
  var requestCookie = headerValue(requestHeaders, "cookie");
  if (!headerPhone) {
    var headerKeys = Object.keys(requestHeaders);
    for (var headerIndex = 0; headerIndex < headerKeys.length; headerIndex++) {
      headerPhone = findPhoneInText(requestHeaders[headerKeys[headerIndex]]);
      if (headerPhone) break;
    }
  }
  if (!headerPhone && requestCookie) {
    headerPhone = findPhoneInText(requestCookie);
  }

  var ticket =
    queryValue(url, "ticket") ||
    queryValue(url, "ticketId") ||
    headerValue(requestHeaders, "ticket");
  if (ticket) auth.ticket = ticket;
  if (headerPhone || body.phone) auth.phone = headerPhone || body.phone;

  var hostValues = {};
  if (requestCookie) hostValues.cookie = requestCookie;
  var setCookie = responseHeaders["set-cookie"] || responseHeaders["Set-Cookie"];
  if (setCookie) {
    var previousCookie =
      (auth.hosts[host] && auth.hosts[host].cookie) || requestCookie || "";
    hostValues.cookie = mergeSetCookie(
      previousCookie,
      Array.isArray(setCookie) ? setCookie : [setCookie]
    );
  }
  [
    ["sign", "sign"],
    ["authorization", "authorization"],
    ["user-agent", "userAgent"],
    ["referer", "referer"],
    ["origin", "origin"],
    ["content-type", "contentType"],
  ].forEach(function (entry) {
    var value = headerValue(requestHeaders, entry[0]);
    if (value) hostValues[entry[1]] = value;
  });
  if (body.token) hostValues.token = body.token;
  if (body.userId) hostValues.userId = body.userId;
  if (body.sign) hostValues.sign = body.sign;
  mergeHost(auth, host, hostValues);
  auth.updatedAt = Date.now();
  return auth;
}

function main() {
  var previous = {};
  try {
    previous = JSON.parse($prefs.valueForKey(AUTH_KEY) || "{}");
  } catch (error) {
    previous = {};
  }

  var next = captureEvent(
    {
      request: typeof $request !== "undefined" ? $request : null,
      response: typeof $response !== "undefined" ? $response : null,
    },
    previous
  );
  $prefs.setValueForKey(JSON.stringify(next), AUTH_KEY);

  var wap = next.hosts["wappark.189.cn"] || {};
  var missing = [];
  if (!next.phone) missing.push("手机号");
  if (!wap.cookie) missing.push("WAP Cookie");
  if (!wap.sign) missing.push("sign 签名");
  var ready = missing.length === 0;
  var lastNotify = 0;
  try {
    lastNotify = parseInt($prefs.valueForKey(NOTIFY_KEY) || "0", 10) || 0;
  } catch (error) {
    lastNotify = 0;
  }
  if (ready && Date.now() - lastNotify >= NOTIFY_GAP_MS) {
    $prefs.setValueForKey(String(Date.now()), NOTIFY_KEY);
    $notify(
      "电信营业厅",
      "登录态已抓取",
      next.phone.slice(0, 3) + "****" + next.phone.slice(-4)
    );
  } else if (
    hostFromURL(
      String(
        (typeof $request !== "undefined" && $request && $request.url) ||
          (typeof $response !== "undefined" && $response && $response.url) ||
          ""
      )
    ) === "wappark.189.cn"
  ) {
    var status = missing.join("|");
    var lastStatus = "";
    try {
      lastStatus = $prefs.valueForKey(STATUS_KEY) || "";
    } catch (error) {
      lastStatus = "";
    }
    var parts = lastStatus.split("|", 2);
    var lastMissing = parts[0] || "";
    var lastStatusTime = parseInt(parts[1] || "0", 10) || 0;
    if (
      lastMissing !== status ||
      Date.now() - lastStatusTime >= STATUS_GAP_MS
    ) {
      $prefs.setValueForKey(status + "|" + Date.now(), STATUS_KEY);
      $notify(
        "电信营业厅",
        "登录态抓取不完整",
        "缺少：" +
          missing.join("、") +
          (missing.indexOf("手机号") >= 0
            ? "\n请完全退出电信 App 后重新登录一次。"
            : "\n请确认重写、MITM 与活动页请求头均正常。")
      );
    }
  }
  if (
    typeof $response !== "undefined" &&
    $response &&
    $response.body !== undefined
  ) {
    $done({ body: $response.body });
  } else {
    $done({});
  }
}

if (typeof module !== "undefined") {
  module.exports = { captureEvent };
} else if (typeof $prefs !== "undefined") {
  try {
    main();
  } catch (error) {
    console.log("[电信] 捕获失败: " + String(error));
    $done({});
  }
}
