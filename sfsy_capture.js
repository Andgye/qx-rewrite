/*
 * 顺丰速运 Cookie 捕获（Quantumult X）
 *
 * 用途：
 * 1. 拦截 mcs-mimp-web.sf-express.com 的请求头 Cookie；
 * 2. 同时合并响应头里的 Set-Cookie；
 * 3. 只有确认抓到了登录手机号和登录态后才写入 $prefs。
 *
 * 存储键：sfsy_cookie
 */

const COOKIE_KEY = "sfsy_cookie";

function headerValues(headers, name) {
  if (!headers) return [];

  const target = String(name).toLowerCase();
  const keys = Object.keys(headers);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.toLowerCase() !== target) continue;

    const value = headers[key];
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return String(item);
      });
    }
    return value === undefined || value === null ? [] : [String(value)];
  }

  return [];
}

function parseCookieText(text) {
  const result = {};
  const parts = String(text || "").split(";");

  for (let i = 0; i < parts.length; i++) {
    const item = parts[i].trim();
    const pos = item.indexOf("=");
    if (pos <= 0) continue;

    const name = item.slice(0, pos).trim();
    const value = item.slice(pos + 1).trim();
    if (name) result[name] = value;
  }

  return result;
}

function setCookieParts(values) {
  const result = [];

  for (let i = 0; i < values.length; i++) {
    const raw = String(values[i] || "");
    const pieces = raw.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/);

    for (let j = 0; j < pieces.length; j++) {
      const piece = pieces[j].trim();
      if (piece) result.push(piece);
    }
  }

  return result;
}

function mergeCookie(base, text) {
  const jar = parseCookieText(base);
  const incoming = parseCookieText(text);
  const names = Object.keys(incoming);

  for (let i = 0; i < names.length; i++) {
    jar[names[i]] = incoming[names[i]];
  }

  return Object.keys(jar)
    .map(function (name) {
      return name + "=" + jar[name];
    })
    .join("; ");
}

function mergeSetCookie(base, setCookieValues) {
  let cookie = base;
  const lines = setCookieParts(setCookieValues);
  const ignored = [
    "path",
    "domain",
    "expires",
    "max-age",
    "samesite",
    "secure",
    "httponly",
    "priority",
  ];

  for (let i = 0; i < lines.length; i++) {
    const segments = lines[i].split(";");
    const pair = segments[0].trim();
    const pos = pair.indexOf("=");
    if (pos <= 0) continue;

    const name = pair.slice(0, pos).trim();
    const value = pair.slice(pos + 1).trim();
    if (!name || ignored.indexOf(name.toLowerCase()) >= 0) continue;

    const jar = parseCookieText(cookie);
    let deleted = value === "";

    for (let j = 1; j < segments.length; j++) {
      const attr = segments[j].trim().toLowerCase();
      if (attr === "max-age=0") deleted = true;
    }

    if (deleted) {
      delete jar[name];
    } else {
      jar[name] = value;
    }

    cookie = Object.keys(jar)
      .map(function (key) {
        return key + "=" + jar[key];
      })
      .join("; ");
  }

  return cookie;
}

function isUsableCookie(cookie) {
  const jar = parseCookieText(cookie);
  return Boolean(
    jar._login_mobile_ &&
      (jar.sessionId || jar.SESSION || jar._login_user_id_)
  );
}

function maskMobile(cookie) {
  const mobile = parseCookieText(cookie)._login_mobile_ || "";
  if (mobile.length >= 7) {
    return mobile.slice(0, 3) + "****" + mobile.slice(7);
  }
  return mobile || "未知手机号";
}

function capture() {
  try {
    let oldCookie = "";
    try {
      oldCookie = $prefs.valueForKey(COOKIE_KEY) || "";
    } catch (e) {
      oldCookie = "";
    }

    let cookie = oldCookie;
    const requestCookie = headerValues(
      typeof $request !== "undefined" ? $request.headers : null,
      "cookie"
    ).join("; ");

    if (requestCookie) {
      cookie = mergeCookie(cookie, requestCookie);
    }

    if (typeof $response !== "undefined" && $response) {
      const setCookie = headerValues($response.headers, "set-cookie");
      if (setCookie.length) {
        cookie = mergeSetCookie(cookie, setCookie);
      }
    }

    if (isUsableCookie(cookie) && cookie !== oldCookie) {
      const saved = $prefs.setValueForKey(cookie, COOKIE_KEY);
      if (saved !== false) {
        $notify(
          "顺丰速运 Cookie",
          oldCookie ? "登录态已更新" : "登录态获取成功",
          maskMobile(cookie)
        );
        console.log("[顺丰] Cookie 已写入 " + COOKIE_KEY);
      }
    }
  } catch (error) {
    console.log("[顺丰] Cookie 捕获失败: " + String(error));
  } finally {
    $done({});
  }
}

capture();
