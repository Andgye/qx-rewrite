const defaultConfig = {
  MANUAL_PHONE: "",
  MANUAL_PASSWORD: "",
  USE_PASSWORD_LOGIN: true,
  ENABLE_SIGN: true,
  ENABLE_CONTINUE_LOTTERY: true,
  ENABLE_HOME_TASKS: true,
  ENABLE_PET_FEED: true,
  ENABLE_PET_RIGHTS: true,
  ENABLE_MONTHLY_GIFT: true,
  ENABLE_MEDIA_TASKS: true,
  ENABLE_MALL_LOTTERY: true,
  ALLOW_BEAN_SPENDING: false,
};

const AES_KEY = "34d7cb0bcdf07523";
const LOGIN_PUBLIC_KEY =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofd" +
  "WzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18" +
  "qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiP" +
  "Mpq0/XKBO8lYhN/gwIDAQAB";
const TICKET_KEY = "1234567`90koiuyhgtfrdews";
const PARAM_PUBLIC_KEY =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6" +
  "JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65d" +
  "U8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcA" +
  "dcbpk2L+udld5kZNwIDAQAB";

let CRYPTO_JS = null;
if (typeof module !== "undefined") {
  try {
    CRYPTO_JS = require("./crypto-js.min.js");
  } catch (error) {
    CRYPTO_JS = null;
  }
}

function utf8Bytes(text) {
  const bytes = [];
  const source = String(text);
  for (let i = 0; i < source.length; i++) {
    let code = source.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(++i);
      code = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

function bytesToHex(bytes) {
  return bytes
    .map(function (value) {
      return (value < 16 ? "0" : "") + value.toString(16);
    })
    .join("");
}

function hexToBytes(text) {
  const clean = String(text || "").replace(/[^0-9a-f]/gi, "");
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

function gfMultiply(a, b) {
  let result = 0;
  let left = a;
  let right = b;
  for (let i = 0; i < 8; i++) {
    if (right & 1) result ^= left;
    const high = left & 0x80;
    left = (left << 1) & 0xff;
    if (high) left ^= 0x1b;
    right >>= 1;
  }
  return result;
}

function gfPower(value, exponent) {
  let result = 1;
  let base = value;
  let power = exponent;
  while (power > 0) {
    if (power & 1) result = gfMultiply(result, base);
    base = gfMultiply(base, base);
    power >>= 1;
  }
  return result;
}

function rotateByte(value, amount) {
  return ((value << amount) | (value >> (8 - amount))) & 0xff;
}

function buildSBox() {
  const box = [];
  for (let i = 0; i < 256; i++) {
    const inverse = i === 0 ? 0 : gfPower(i, 254);
    box[i] =
      inverse ^
      rotateByte(inverse, 1) ^
      rotateByte(inverse, 2) ^
      rotateByte(inverse, 3) ^
      rotateByte(inverse, 4) ^
      0x63;
  }
  return box;
}

const AES_SBOX = buildSBox();

function aesExpandKey(keyBytes) {
  const expanded = keyBytes.slice();
  let generated = 16;
  let rcon = 1;
  while (generated < 176) {
    let temp = expanded.slice(generated - 4, generated);
    if (generated % 16 === 0) {
      temp = [
        AES_SBOX[temp[1]] ^ rcon,
        AES_SBOX[temp[2]],
        AES_SBOX[temp[3]],
        AES_SBOX[temp[0]],
      ];
      rcon = gfMultiply(rcon, 2);
    }
    for (let i = 0; i < 4; i++) {
      expanded[generated] = expanded[generated - 16] ^ temp[i];
      generated++;
    }
  }
  return expanded;
}

function aesEncryptBlock(block, expanded) {
  let state = block.slice();
  for (let i = 0; i < 16; i++) state[i] ^= expanded[i];

  for (let round = 1; round <= 10; round++) {
    for (let i = 0; i < 16; i++) state[i] = AES_SBOX[state[i]];

    const shifted = state.slice();
    for (let row = 1; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        shifted[row + 4 * col] =
          state[row + 4 * ((col + row) % 4)];
      }
    }
    state = shifted;

    if (round !== 10) {
      for (let col = 0; col < 4; col++) {
        const offset = col * 4;
        const a = state.slice(offset, offset + 4);
        state[offset] = gfMultiply(a[0], 2) ^ gfMultiply(a[1], 3) ^ a[2] ^ a[3];
        state[offset + 1] =
          a[0] ^ gfMultiply(a[1], 2) ^ gfMultiply(a[2], 3) ^ a[3];
        state[offset + 2] =
          a[0] ^ a[1] ^ gfMultiply(a[2], 2) ^ gfMultiply(a[3], 3);
        state[offset + 3] =
          gfMultiply(a[0], 3) ^ a[1] ^ a[2] ^ gfMultiply(a[3], 2);
      }
    }

    for (let i = 0; i < 16; i++) {
      state[i] ^= expanded[round * 16 + i];
    }
  }
  return state;
}

function aesCbcPkcs7Encrypt(text, key, iv) {
  const keyBytes = utf8Bytes(key);
  const ivBytes =
    typeof iv === "string" ? hexToBytes(iv) : Array.from(iv || []);
  if (keyBytes.length !== 16 || ivBytes.length !== 16) {
    throw new Error("AES-128 requires a 16-byte key and IV");
  }

  const plain = utf8Bytes(text);
  const padding = 16 - (plain.length % 16);
  for (let i = 0; i < padding; i++) plain.push(padding);
  const expanded = aesExpandKey(keyBytes);
  const cipher = [];
  let previous = ivBytes.slice();

  for (let offset = 0; offset < plain.length; offset += 16) {
    const block = plain.slice(offset, offset + 16);
    for (let i = 0; i < 16; i++) block[i] ^= previous[i];
    previous = aesEncryptBlock(block, expanded);
    cipher.push.apply(cipher, previous);
  }
  return bytesToHex(cipher);
}

function tripleDesCbcPkcs7Encrypt(text, key, iv) {
  if (!CRYPTO_JS) throw new Error("CryptoJS is not loaded");
  const ivBytes =
    typeof iv === "string" ? hexToBytes(iv) : Array.from(iv || []);
  if (ivBytes.length !== 8) throw new Error("3DES requires an 8-byte IV");
  const encrypted = CRYPTO_JS.TripleDES.encrypt(
    CRYPTO_JS.enc.Utf8.parse(String(text)),
    CRYPTO_JS.enc.Utf8.parse(String(key)),
    {
      mode: CRYPTO_JS.mode.CBC,
      padding: CRYPTO_JS.pad.Pkcs7,
      iv: CRYPTO_JS.enc.Hex.parse(bytesToHex(ivBytes)),
    }
  );
  return encrypted.ciphertext.toString(CRYPTO_JS.enc.Hex).toUpperCase();
}

function tripleDesCbcPkcs7Decrypt(ciphertext, key, iv) {
  if (!CRYPTO_JS) throw new Error("CryptoJS is not loaded");
  const ivBytes =
    typeof iv === "string" ? hexToBytes(iv) : Array.from(iv || []);
  if (ivBytes.length !== 8) throw new Error("3DES requires an 8-byte IV");
  const params = CRYPTO_JS.lib.CipherParams.create({
    ciphertext: CRYPTO_JS.enc.Hex.parse(String(ciphertext || "")),
  });
  const decrypted = CRYPTO_JS.TripleDES.decrypt(
    params,
    CRYPTO_JS.enc.Utf8.parse(String(key)),
    {
      mode: CRYPTO_JS.mode.CBC,
      padding: CRYPTO_JS.pad.Pkcs7,
      iv: CRYPTO_JS.enc.Hex.parse(bytesToHex(ivBytes)),
    }
  );
  return decrypted.toString(CRYPTO_JS.enc.Utf8);
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Decode(text) {
  const clean = String(text || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === "=") break;
    const index = BASE64_ALPHABET.indexOf(clean[i]);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function base64Encode(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const value = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(value >> 18) & 63];
    output += BASE64_ALPHABET[(value >> 12) & 63];
    output += i + 1 < bytes.length ? BASE64_ALPHABET[(value >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? BASE64_ALPHABET[value & 63] : "=";
  }
  return output;
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

function bigIntToBytes(value, length) {
  const bytes = new Array(length || 0).fill(0);
  let current = value;
  let index = bytes.length - 1;
  while (current > 0n && index >= 0) {
    bytes[index--] = Number(current & 0xffn);
    current >>= 8n;
  }
  if (current > 0n) throw new Error("RSA integer exceeds output length");
  return bytes;
}

function readDer(bytes, offset) {
  if (offset + 2 > bytes.length) throw new Error("Invalid DER");
  const tag = bytes[offset++];
  let length = bytes[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | bytes[offset++];
  }
  return { tag, start: offset, end: offset + length };
}

function parseRsaPublicKey(publicKey) {
  const der = base64Decode(publicKey);
  const outer = readDer(der, 0);
  let offset = outer.start;
  const algorithm = readDer(der, offset);
  offset = algorithm.end;
  const bitString = readDer(der, offset);
  if (bitString.tag !== 0x03) throw new Error("RSA key is not SPKI");
  let rsaOffset = bitString.start + 1;
  const sequence = readDer(der, rsaOffset);
  rsaOffset = sequence.start;
  const modulusNode = readDer(der, rsaOffset);
  const exponentNode = readDer(der, modulusNode.end);
  if (modulusNode.tag !== 0x02 || exponentNode.tag !== 0x02) {
    throw new Error("Invalid RSA key integers");
  }
  let modulusBytes = der.slice(modulusNode.start, modulusNode.end);
  let exponentBytes = der.slice(exponentNode.start, exponentNode.end);
  if (modulusBytes.length > 1 && modulusBytes[0] === 0) modulusBytes = modulusBytes.slice(1);
  if (exponentBytes.length > 1 && exponentBytes[0] === 0) exponentBytes = exponentBytes.slice(1);
  const modulus = bytesToBigInt(modulusBytes);
  const exponent = bytesToBigInt(exponentBytes);
  return {
    modulus,
    exponent,
    size: modulusBytes.length,
  };
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  let current = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * current) % modulus;
    current = (current * current) % modulus;
    power >>= 1n;
  }
  return result;
}

function rsaPkcs1Encrypt(text, publicKey) {
  const key = parseRsaPublicKey(publicKey || PARAM_PUBLIC_KEY);
  const message = utf8Bytes(text);
  if (message.length > key.size - 11) throw new Error("RSA message too long");
  const paddingLength = key.size - message.length - 3;
  const block = [0, 2];
  for (let i = 0; i < paddingLength; i++) {
    block.push(Math.floor(Math.random() * 255) + 1);
  }
  block.push(0);
  block.push.apply(block, message);
  const encrypted = modPow(bytesToBigInt(block), key.exponent, key.modulus);
  return base64Encode(bigIntToBytes(encrypted, key.size));
}

const XBK_PUBLIC_KEY =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDIPOHtjs6p4sTlpFvrx+ESsYkEvyT4" +
  "JB/dcEbU6C8+yclpcmWEvwZFymqlKQq89laSH4IxUsPJHKIOiYAMzNibhED1swzecH5" +
  "XLKEAJclopJqoO95o8W63Euq6K+AKMzyZt1SEqtZ0mXsN8UPnuN/5aoB3kbPLYpfEwBb" +
  "hto6yrwIDAQAB";

const APP_HOST = "appgologin.189.cn";
const WAP_HOST = "wappark.189.cn";
const XBK_HOST = "xbk.189.cn";
const MALL_HOST = "wapact.189.cn";
const SERVICE_HOST = "appfuwu.189.cn";

function parseJSON(text, fallback) {
  if (text && typeof text === "object") return text;
  try {
    return JSON.parse(String(text || ""));
  } catch (error) {
    return fallback || {};
  }
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function listed(value) {
  return Array.isArray(value) ? value : [];
}

function parseCookieText(text) {
  const jar = {};
  String(text || "")
    .split(";")
    .forEach(function (part) {
      const item = part.trim();
      const pos = item.indexOf("=");
      if (pos > 0) jar[item.slice(0, pos)] = item.slice(pos + 1);
    });
  return jar;
}

function mergeCookieText(base, incoming) {
  const jar = parseCookieText(base);
  const next = parseCookieText(incoming);
  Object.keys(next).forEach(function (key) {
    jar[key] = next[key];
  });
  return Object.keys(jar)
    .map(function (key) {
      return key + "=" + jar[key];
    })
    .join("; ");
}

function mergeSetCookieText(base, values) {
  let cookie = String(base || "");
  listed(values).forEach(function (raw) {
    String(raw || "")
      .split(/,(?=\s*[^=;,]+=)/)
      .forEach(function (line) {
        const first = line.split(";")[0].trim();
        const pos = first.indexOf("=");
        if (pos <= 0) return;
        cookie = mergeCookieText(cookie, first);
      });
  });
  return cookie;
}

function shiftCharacters(value, amount) {
  return Array.from(String(value || ""))
    .map(function (char) {
      return String.fromCharCode(char.charCodeAt(0) + amount);
    })
    .join("");
}

function randomHex(length) {
  const chars = "0123456789abcdef";
  let output = "";
  for (let i = 0; i < length; i++) {
    output += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return output;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const pad = function (value) {
    return (value < 10 ? "0" : "") + value;
  };
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function maskPhone(phone) {
  const text = String(phone || "");
  return text.length >= 7
    ? text.slice(0, 3) + "****" + text.slice(-4)
    : "未知号码";
}

function createError(message, authExpired) {
  const error = new Error(message);
  error.authExpired = Boolean(authExpired);
  return error;
}

function headersFor(auth, host, json) {
  const saved = (auth.hosts && auth.hosts[host]) || {};
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      saved.userAgent ||
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) " +
        "AppleWebKit/605.1.15 Mobile/15E148",
  };
  if (json) headers["Content-Type"] = "application/json;charset=utf-8";
  if (saved.cookie) headers.Cookie = saved.cookie;
  if (saved.sign) headers.sign = saved.sign;
  if (saved.authorization) headers.Authorization = saved.authorization;
  if (saved.referer) headers.Referer = saved.referer;
  if (saved.origin) headers.Origin = saved.origin;
  return headers;
}

function responseObject(request) {
  const body =
    request && request.body !== undefined
      ? request.body
      : request && request.json !== undefined
        ? JSON.stringify(request.json)
        : undefined;
  return {
    url: String(request.url),
    method: String(request.method || (body ? "POST" : "GET")).toUpperCase(),
    headers: request.headers || {},
    body,
    timeout: 20000,
  };
}

async function runDaily(options) {
  const env = Object.assign(
    {
      prefs: {
        valueForKey() {
          return "";
        },
        setValueForKey() {
          return false;
        },
      },
      transport: null,
      notify() {},
      wait(ms) {
        return new Promise(function (resolve) {
          setTimeout(resolve, ms);
        });
      },
      now() {
        return Date.now();
      },
      config: {},
    },
    options || {}
  );
  const config = Object.assign({}, defaultConfig, env.config || {});
  const reports = [];
  let auth = {};
  let authExpired = false;
  let xbkAuthorization = "";
  let mallAuthorization = "";
  let coin = 0;
  let signDays = 0;
  let level = 0;
  let growth = "";
  let stageFailed = false;

  function report(text) {
    reports.push(text);
    console.log("[电信] " + text);
  }

  function notify(title, subtitle, body) {
    try {
      env.notify(title, subtitle, body);
    } catch (error) {}
  }

  async function runStage(label, action) {
    try {
      await action();
    } catch (error) {
      if (error && error.authExpired) throw error;
      stageFailed = true;
      report(
        label +
          "失败，后续活动继续: " +
          String((error && error.message) || error)
      );
    }
  }

  function loadAuth() {
    try {
      auth = parseJSON(env.prefs.valueForKey("qx_telecom_auth"), {});
    } catch (error) {
      auth = {};
    }
    auth.hosts = auth.hosts || {};
    const manualPhone = String(config.MANUAL_PHONE || "").replace(/\D/g, "");
    if (/^1[3-9]\d{9}$/.test(manualPhone) && auth.phone !== manualPhone) {
      auth.phone = manualPhone;
    }
    xbkAuthorization = (auth.hosts[XBK_HOST] || {}).authorization || "";
    mallAuthorization = (auth.hosts[MALL_HOST] || {}).authorization || "";
  }

  async function request(host, url, requestOptions) {
    if (typeof env.transport !== "function") {
      throw new Error("未配置网络请求");
    }
    const opts = (requestOptions && requestOptions.options) || {};
    const headers = Object.assign(
      headersFor(auth, host, Boolean(opts.body || opts.json)),
      opts.headers || {}
    );
    if (host === XBK_HOST && xbkAuthorization) {
      headers.Authorization = xbkAuthorization;
    }
    if (host === MALL_HOST && mallAuthorization) {
      headers.Authorization = mallAuthorization;
    }
    const payload = Object.assign({}, opts, { url, headers });
    const raw = await env.transport(responseObject(payload));
    const statusCode = numberValue(raw && raw.statusCode, 0);
    const text =
      raw && raw.body !== undefined && raw.body !== null
        ? typeof raw.body === "string"
          ? raw.body
          : JSON.stringify(raw.body)
        : "";
    const data = parseJSON(text, {});
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode === 412 ||
      /captcha|challenge|WAF/i.test(text.slice(0, 500))
    ) {
      throw createError("电信登录态或风控 Cookie 已失效", true);
    }
    if (statusCode >= 500) throw new Error("服务返回 HTTP " + statusCode);
    return {
      statusCode,
      headers: (raw && raw.headers) || {},
      data,
      text,
    };
  }

  async function ensureCryptoJS() {
    if (CRYPTO_JS && CRYPTO_JS.TripleDES) return;
    let source = "";
    try {
      source = env.prefs.valueForKey("qx_crypto_js") || "";
    } catch (error) {
      source = "";
    }
    if (source.length < 10000) {
      const response = await env.transport({
        url:
          "https://raw.githubusercontent.com/Andgye/qx-rewrite/main/crypto-js.min.js",
        method: "GET",
        headers: { Accept: "*/*" },
        timeout: 20000,
      });
      source =
        response && response.body !== undefined
          ? String(response.body)
          : "";
      if (source.length < 10000) throw new Error("CryptoJS 下载失败");
      try {
        env.prefs.setValueForKey(source, "qx_crypto_js");
      } catch (error) {}
    }
    const shim = { exports: {} };
    new Function("module", "exports", source)(shim, shim.exports);
    CRYPTO_JS =
      shim.exports && shim.exports.TripleDES
        ? shim.exports
        : globalThis.CryptoJS;
    if (!CRYPTO_JS || !CRYPTO_JS.TripleDES) {
      throw new Error("CryptoJS 初始化失败");
    }
  }

  async function loginWithPassword() {
    const timestamp = formatTimestamp(env.now());
    const uuid = [
      randomHex(8),
      randomHex(4),
      "4" + randomHex(3),
      randomHex(4),
      randomHex(12),
    ];
    const phoneCipher = shiftCharacters(auth.phone, 2);
    const passwordCipher = shiftCharacters(config.MANUAL_PASSWORD, 2);
    const authSource =
      "iPhone 14 15.4." +
      uuid.slice(0, 2).join("") +
      auth.phone +
      timestamp +
      config.MANUAL_PASSWORD +
      "0$$$0.";
    const response = await request(
      APP_HOST,
      "https://appgologin.189.cn:9031/login/client/userLoginNormal",
      {
        options: {
          method: "POST",
          body: JSON.stringify({
            headerInfos: {
              code: "userLoginNormal",
              timestamp,
              broadAccount: "",
              broadToken: "",
              clientType: "#10.5.0#channel50#iPhone 14 Pro Max#",
              shopId: "20002",
              source: "110003",
              sourcePassword: "Sid98s",
              token: "",
              userLoginName: phoneCipher,
            },
            content: {
              attach: "test",
              fieldData: {
                loginType: "4",
                accountType: "",
                loginAuthCipherAsymmertric: rsaPkcs1Encrypt(
                  authSource,
                  LOGIN_PUBLIC_KEY
                ),
                deviceUid: uuid.slice(0, 3).join(""),
                phoneNum: phoneCipher,
                isChinatelecom: "0",
                systemVersion: "15.4.0",
                authentication: passwordCipher,
              },
            },
          }),
        },
      }
    );
    const responseData = response.data && response.data.responseData;
    const login =
      responseData &&
      responseData.data &&
      responseData.data.loginSuccessResult;
    if (!login || !login.userId || !login.token) {
      throw new Error(
        "服务密码登录失败: " +
          String(
            (response.data &&
              (response.data.msg ||
                (response.data.headerInfos &&
                  response.data.headerInfos.reason))) ||
              (responseData && responseData.resultDesc) ||
              "账号或密码不正确"
          )
      );
    }
    auth.hosts[APP_HOST] = Object.assign({}, auth.hosts[APP_HOST] || {}, {
      userId: String(login.userId),
      token: String(login.token),
      userAgent: headersFor(auth, APP_HOST, true)["User-Agent"],
    });
    report("服务密码登录成功");
  }

  async function getTicket() {
    const login = auth.hosts[APP_HOST] || {};
    if (!login.userId || !login.token) {
      throw new Error("缺少服务密码登录 token");
    }
    const targetId = tripleDesCbcPkcs7Encrypt(
      login.userId,
      TICKET_KEY,
      "0000000000000000"
    );
    const xml =
      "<Request>" +
      "<HeaderInfos>" +
      "<Code>getSingle</Code>" +
      "<Timestamp>" +
      formatTimestamp(env.now()) +
      "</Timestamp>" +
      "<SourcePassword>Sid98s</SourcePassword>" +
      "<Source>110003</Source>" +
      "<ShopId>20002</ShopId>" +
      "<ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType>" +
      "<BroadToken></BroadToken>" +
      "<BroadAccount></BroadAccount>" +
      "<Token>" +
      login.token +
      "</Token>" +
      "<UserLoginName>" +
      auth.phone +
      "</UserLoginName>" +
      "</HeaderInfos>" +
      "<Content>" +
      "<Attach>test</Attach>" +
      "<FieldData>" +
      "<TargetId>" +
      targetId +
      "</TargetId>" +
      "<Url>4a6862274835b451</Url>" +
      "</FieldData>" +
      "</Content>" +
      "</Request>";
    const response = await request(
      APP_HOST,
      "https://appgologin.189.cn:9031/map/clientXML",
      {
        options: {
          method: "POST",
          body: xml,
          headers: {
            "Content-Type": "text/xml;charset=UTF-8",
          },
        },
      }
    );
    const match = String(response.text || "").match(
      /<Ticket>([^<]+)<\/Ticket>/i
    );
    if (!match) throw new Error("ticket 接口没有返回 Ticket");
    auth.ticket = tripleDesCbcPkcs7Decrypt(
      match[1],
      TICKET_KEY,
      "0000000000000000"
    );
    if (!auth.ticket) throw new Error("ticket 解密失败");
    report("ticket 获取成功");
  }

  async function getSign() {
    if (!auth.ticket) throw new Error("缺少 ticket，无法获取 sign");
    const response = await request(
      WAP_HOST,
      "https://wappark.189.cn/jt-sign/ssoHomLogin?ticket=" +
        encodeURIComponent(auth.ticket),
      { options: { method: "GET" } }
    );
    if (!isSuccess(response.data) || !response.data.sign) {
      throw new Error(
        "sign 获取失败: " +
          String(response.data.msg || response.data.resoultMsg || "未知")
      );
    }
    const setCookie =
      response.headers["set-cookie"] || response.headers["Set-Cookie"];
    auth.hosts[WAP_HOST] = Object.assign({}, auth.hosts[WAP_HOST] || {}, {
      cookie: mergeSetCookieText(
        (auth.hosts[WAP_HOST] && auth.hosts[WAP_HOST].cookie) || "",
        Array.isArray(setCookie) ? setCookie : listed(setCookie)
      ),
      sign: String(response.data.sign),
      userAgent: headersFor(auth, WAP_HOST, false)["User-Agent"],
    });
    report("WAP sign 获取成功");
  }

  async function prepareAuth() {
    loadAuth();
    const manualPhone = String(config.MANUAL_PHONE || "").replace(/\D/g, "");
    const manualPassword = String(config.MANUAL_PASSWORD || "");
    const usePassword =
      config.USE_PASSWORD_LOGIN &&
      /^1[3-9]\d{9}$/.test(manualPhone) &&
      manualPassword.length > 0;
    if (usePassword) {
      auth.phone = manualPhone;
      try {
        await ensureCryptoJS();
        await loginWithPassword();
        await getTicket();
        await getSign();
        auth.updatedAt = env.now();
        env.prefs.setValueForKey(
          JSON.stringify(auth),
          "qx_telecom_auth"
        );
        return;
      } catch (error) {
        const wap = auth.hosts[WAP_HOST] || {};
        if (auth.phone && wap.sign && wap.cookie) {
          report(
            "服务密码自动登录失败，改用已抓取登录态: " +
              String(error.message || error)
          );
          return;
        }
        throw error;
      }
    }
    const wap = auth.hosts[WAP_HOST] || {};
    if (!auth.phone || !wap.sign || !wap.cookie) {
      throw createError(
        "缺少电信登录态，请填写 MANUAL_PHONE/MANUAL_PASSWORD 或先抓取活动页",
        true
      );
    }
    try {
      env.prefs.setValueForKey(JSON.stringify(auth), "qx_telecom_auth");
    } catch (error) {}
  }

  function parameter(phone) {
    return rsaPkcs1Encrypt(JSON.stringify(phone), PARAM_PUBLIC_KEY);
  }

  function resultCode(data, fallback) {
    if (data && data.resoultCode !== undefined) return data.resoultCode;
    if (data && data.code !== undefined) return data.code;
    return fallback === undefined ? -1 : fallback;
  }

  function isSuccess(data) {
    const code = resultCode(data, -1);
    return code === 0 || code === "0" || data.success === true;
  }

  async function wapPost(path, json) {
    return request(WAP_HOST, "https://wappark.189.cn" + path, {
      options: {
        method: "POST",
        body: JSON.stringify(json || {}),
      },
    });
  }

  async function userCoinInfo(show) {
    const response = await wapPost("/jt-sign/api/home/userCoinInfo", {
      para: parameter({ phone: auth.phone }),
    });
    if (!isSuccess(response.data)) return;
    coin = numberValue(response.data.totalCoin, coin);
    if (show) report("金豆余额 " + coin);
    if (response.data.amountEx) report("即将过期金豆 " + response.data.amountEx);
  }

  async function doSign() {
    const payload = JSON.stringify({
      phone: auth.phone,
      date: env.now(),
      sysType: "20002",
    });
    const response = await wapPost("/jt-sign/webSign/sign", {
      encode: aesCbcPkcs7Encrypt(payload, AES_KEY, "00000000000000000000000000000000"),
    });
    const data = response.data || {};
    const innerCode = numberValue(data.data && data.data.code, -1);
    if (isSuccess(data) && innerCode === 1) {
      report("签到成功，获得 " + numberValue(data.data && data.data.coin, 0) + " 金豆");
    } else if (isSuccess(data) && /已签|重复|完成/.test(String((data.data && data.data.msg) || data.msg || ""))) {
      report("今日已签到");
    } else {
      report("签到失败: " + String((data.data && data.data.msg) || data.msg || "未知"));
    }
  }

  async function userStatusInfo() {
    const body = { para: parameter({ phone: auth.phone }) };
    let response = await wapPost("/jt-sign/api/home/userStatusInfo", body);
    if (!isSuccess(response.data)) {
      report("签到状态查询失败");
      return;
    }
    if (!response.data.data || !response.data.data.isSign) await doSign();
    response = await wapPost("/jt-sign/api/home/userStatusInfo", body);
    const data = (response.data && response.data.data) || {};
    signDays = numberValue(data.signDay, signDays);
    if (signDays) report("连续签到 " + signDays + " 天");
  }

  async function exchangePrize(type) {
    const response = await wapPost("/jt-sign/webSign/exchangePrize", {
      para: parameter({ phone: auth.phone, type: String(type) }),
    });
    if (isSuccess(response.data)) {
      const prize = response.data.prizeDetail || {};
      report(
        "连签 " +
          type +
          " 天抽奖: " +
          String((prize.biz && prize.biz.winTitle) || prize.title || "已领取")
      );
    } else {
      report("连签 " + type + " 天抽奖失败");
    }
  }

  async function continueSignRecords() {
    const response = await wapPost("/jt-sign/webSign/continueSignRecords", {
      para: parameter({ phone: auth.phone }),
    });
    if (!isSuccess(response.data)) {
      report("连签抽奖状态查询失败");
      return;
    }
    if (listed(response.data.continue15List).length) await exchangePrize(15);
    if (listed(response.data.continue28List).length) await exchangePrize(28);
  }

  async function receiveReward(task) {
    const response = await wapPost("/jt-sign/paradise/receiveReward", {
      para: parameter({
        phone: auth.phone,
        rewardId: task.rewardId || "",
      }),
    });
    report(
      isSuccess(response.data)
        ? "领取任务奖励成功"
        : "领取任务奖励失败"
    );
  }

  async function openMsg(task) {
    const response = await wapPost("/jt-sign/paradise/openMsg", {
      para: parameter({ phone: auth.phone }),
    });
    report(
      isSuccess(response.data)
        ? "完成任务[" + String(task.title || "消息").split(" ")[0] + "]成功"
        : "消息任务失败"
    );
  }

  async function polymerize(task) {
    const response = await wapPost("/jt-sign/webSign/polymerize", {
      para: parameter({ phone: auth.phone, jobId: task.taskId }),
    });
    report(
      isSuccess(response.data)
        ? "完成聚合任务[" + String(task.title || "未知").split(" ")[0] + "]"
        : "聚合任务失败"
    );
  }

  async function sharingGetGold() {
    const service = auth.hosts[SERVICE_HOST] || {};
    const response = await request(
      SERVICE_HOST,
      "https://appfuwu.189.cn:9021/query/sharingGetGold",
      {
        options: {
          method: "POST",
          body: JSON.stringify({
            headerInfos: {
              code: "sharingGetGold",
              timestamp: String(env.now()),
              token: service.token || "",
              userLoginName: auth.phone,
              clientType: "#9.6.1#channel50#iPhone 14 Pro Max#",
              shopId: "20002",
              source: "110003",
              sourcePassword: "Sid98s",
            },
            content: {
              attach: "test",
              fieldData: {
                shareSource: "3",
                userId: service.userId || "",
                account: auth.phone,
              },
            },
          }),
        },
      }
    );
    const code = response.data && response.data.responseData && response.data.responseData.resultCode;
    report(code === "0000" || isSuccess(response.data) ? "分享任务成功" : "分享任务失败");
  }

  async function ensureXBK() {
    if (xbkAuthorization) return;
    const jump = await request(
      XBK_HOST,
      "https://xbk.189.cn/xbkapi/api/auth/jump?userID=" +
        encodeURIComponent(auth.ticket || "") +
        "&version=9.3.3&type=room&l=renwu",
      { options: { method: "GET" } }
    );
    const location = String(
      jump.headers.location || jump.headers.Location || ""
    );
    const match = location.match(/usercode=([^&#]+)/);
    if (!match) throw new Error("翼播客登录跳转未返回 usercode");
    const token = await request(
      XBK_HOST,
      "https://xbk.189.cn/xbkapi/api/auth/userinfo/codeToken",
      {
        options: {
          method: "POST",
          body: JSON.stringify({ usercode: decodeURIComponent(match[1]) }),
        },
      }
    );
    if (!isSuccess(token.data) || !token.data.data || !token.data.data.token) {
      throw new Error("翼播客 token 获取失败");
    }
    xbkAuthorization =
      "Bearer " + rsaPkcs1Encrypt(token.data.data.token, XBK_PUBLIC_KEY);
    report("翼播客登录成功");
  }

  async function watchLive() {
    await ensureXBK();
    const liveId = Math.floor(Math.random() * 1000) + 1000;
    const init = await request(
      XBK_HOST,
      "https://xbk.189.cn/xbkapi/lteration/liveTask/index/watchLiveInit",
      {
        options: {
          method: "POST",
          body: JSON.stringify({ period: 1, liveId }),
        },
      }
    );
    if (!isSuccess(init.data)) {
      report("直播任务初始化失败");
      return;
    }
    await env.wait(15000);
    const finish = await request(
      XBK_HOST,
      "https://xbk.189.cn/xbkapi/lteration/liveTask/index/watchLive",
      {
        options: {
          method: "POST",
          body: JSON.stringify({ period: 1, liveId, key: init.data.data || "" }),
        },
      }
    );
    report(isSuccess(finish.data) ? "直播任务完成" : "直播任务失败");
  }

  async function watchVideo(articleId) {
    await ensureXBK();
    const response = await request(
      XBK_HOST,
      "https://xbk.189.cn/xbkapi/lteration/liveTask/index/watchVideo",
      {
        options: {
          method: "POST",
          body: JSON.stringify({ articleId }),
        },
      }
    );
    report(isSuccess(response.data) ? "短视频任务完成" : "短视频任务失败");
  }

  async function likeLive(liveId) {
    await ensureXBK();
    const response = await request(
      XBK_HOST,
      "https://xbk.189.cn/xbkapi/lteration/room/like",
      {
        options: {
          method: "POST",
          body: JSON.stringify({ account: auth.phone, liveId }),
        },
      }
    );
    report(isSuccess(response.data) ? "直播点赞完成" : "直播点赞失败");
  }

  async function homepage() {
    const response = await wapPost("/jt-sign/webSign/homepage", {
      para: parameter({
        phone: auth.phone,
        shopId: "20001",
        type: "djzwrz_dq_gh",
      }),
    });
    if (!isSuccess(response.data)) {
      report("活动任务列表查询失败");
      return;
    }
    const data =
      response.data.data && response.data.data.biz
        ? response.data.data.biz
        : response.data.biz || {};
    const tasks = listed(data.adItems);
    report("发现活动任务 " + tasks.length + " 个");
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i] || {};
      if (task.taskState !== undefined && !["0", "1"].includes(String(task.taskState))) {
        continue;
      }
      if (i > 0) await env.wait(1000 + Math.floor(Math.random() * 1500));
      if (task.articleId && config.ENABLE_MEDIA_TASKS) {
        await watchVideo(task.articleId);
      } else if (task.liveId && config.ENABLE_MEDIA_TASKS) {
        await likeLive(task.liveId);
      }
      switch (String(task.contentOne || "")) {
        case "3":
          await receiveReward(task);
          break;
        case "5":
          await openMsg(task);
          break;
        case "6":
          await sharingGetGold();
          break;
        case "10":
        case "31":
          if (config.ENABLE_MEDIA_TASKS && !task.articleId) await watchLive();
          break;
        case "81":
          await polymerize(task);
          break;
        default:
          break;
      }
    }
  }

  async function petFeed() {
    let response = await wapPost("/jt-sign/paradise/getParadiseInfo", {
      para: parameter({ phone: auth.phone }),
    });
    if (!isSuccess(response.data)) {
      report("宠物信息查询失败");
      return;
    }
    const info =
      (response.data.userInfo && response.data.userInfo.levelInfoMap) || {};
    level = numberValue(info.level, level);
    growth =
      numberValue(info.growthValue, 0) +
      "/" +
      numberValue(info.fullGrowthCoinValue, 0);
    let canFeed = true;
    for (let i = 1; i <= 10 && canFeed; i++) {
      response = await wapPost("/jt-sign/paradise/food", {
        para: parameter({ phone: auth.phone }),
      });
      if (isSuccess(response.data)) {
        report("第 " + i + " 次喂食成功");
      } else {
        const message = String(response.data.msg || response.data.resoultMsg || "");
        canFeed = !/最大|上限/.test(message);
        report("第 " + i + " 次喂食失败: " + (message || "未知"));
      }
      await env.wait(500 + Math.floor(Math.random() * 500));
    }
    if (level) report("宠物等级 Lv." + level + "，成长 " + growth);
  }

  async function petRights() {
    if (!config.ALLOW_BEAN_SPENDING) {
      report("宠物权益兑换已存在，但未允许消耗金豆");
      return;
    }
    const list = await wapPost("/jt-sign/paradise/getLevelRightsList", {
      para: parameter({ phone: auth.phone }),
    });
    if (!isSuccess(list.data) && !list.data.currentLevel) {
      report("宠物权益列表查询失败");
      return;
    }
    const currentLevel = numberValue(
      list.data.currentLevel || list.data.level,
      level || 6
    );
    const rights = listed(list.data["V" + currentLevel]);
    for (let i = 0; i < rights.length; i++) {
      const right = rights[i] || {};
      const name = String(right.righstName || right.rightsName || "");
      if (!/元话费|专享.*金豆/.test(name)) continue;
      if (coin < numberValue(right.costCoin, 0)) continue;

      const check = await wapPost("/jt-sign/paradise/getConversionRights", {
        para: parameter({
          phone: auth.phone,
          rightsId: right.id,
          receiveCount: right.receiveType,
        }),
      });
      const status = String(check.data.rightsStatus || "");
      if (
        !isSuccess(check.data) &&
        numberValue(check.data.code, -1) !== 200
      ) {
        report("宠物权益[" + name + "]查询失败");
        continue;
      }
      if (/已兑换|已领取/.test(status)) continue;
      const conversion = await wapPost("/jt-sign/paradise/conversionRights", {
        para: parameter({ phone: auth.phone, rightsId: right.id }),
      });
      report(
        isSuccess(conversion.data)
          ? "兑换宠物权益[" + name + "]成功"
          : "兑换宠物权益[" + name + "]失败"
      );
    }
  }

  async function monthlyGift() {
    if (!auth.ticket) {
      report("每月见面礼跳过：未抓到 ticket");
      return;
    }
    const login = await request(
      WAP_HOST,
      "https://wappark.189.cn/jt-sign/ssoHomLoginCommon?ticket=" +
        encodeURIComponent(auth.ticket),
      { options: { method: "GET" } }
    );
    if (!isSuccess(login.data)) {
      report("每月见面礼登录失败");
      return;
    }
    const accId = login.data.accId || "";
    const info = await wapPost("/jt-sign/welfare/getInfo", {
      para: parameter({ configCode: "nxflb" }),
    });
    const gifts = listed(info.data.data)
      .map(function (item) {
        return item.title || "";
      })
      .filter(Boolean);
    if (gifts.length) report("每月见面礼：" + gifts.join("、"));
    const check = await wapPost("/jt-sign/welfare/check", {
      para: parameter({ phone: auth.phone }),
    });
    const flag =
      (check.data.data && check.data.data.flag) || check.data.flag || "";
    if (isSuccess(check.data)) {
      const receive = await wapPost("/jt-sign/welfare/receive", {
        para: parameter({ phone: auth.phone, flag }),
      });
      report(isSuccess(receive.data) ? "每月见面礼领取完成" : "每月见面礼领取失败");
    }

    const count = await wapPost("/jt-sign/lottery/getCount", {
      para: parameter({ phone: auth.phone, flag }),
    });
    const types = listed(count.data.video).map(function (item) {
      return numberValue(item.videoType, 0);
    });
    [202201, 202202, 202203].forEach(function (type) {
      if (!types.includes(type)) {
        count.pendingTypes = (count.pendingTypes || []).concat(type);
      }
    });
    for (let i = 0; i < listed(count.pendingTypes).length; i++) {
      await wapPost("/jt-sign/lottery/addVideoCount", {
        para: parameter({
          phone: auth.phone,
          videoType: count.pendingTypes[i],
          flag,
        }),
      });
      report("视频抽奖机会 +1");
    }

    const received = await wapPost("/jt-sign/welfare/receiveInfo", {
      para: parameter({ phone: auth.phone }),
    });
    const prizes = listed(received.data.data)
      .map(function (item) {
        return item.prizeName || "";
      })
      .filter(Boolean);
    if (prizes.length) report("见面礼包：" + prizes.join("、"));

    const refresh = await wapPost("/jt-sign/lottery/refresh", {
      para: parameter({ phone: auth.phone, flag }),
    });
    let remain = numberValue(refresh.data.rNumber, 0);
    while (remain-- > 0) {
      const lottery = await wapPost("/jt-sign/lottery/lotteryRevice", {
        para: parameter({ phone: auth.phone, flag }),
      });
      report(
        isSuccess(lottery.data)
          ? "App 抽奖: " + String(lottery.data.rname || "奖励")
          : "App 抽奖失败"
      );
      await env.wait(1000);
    }
    if (accId) report("见面礼账号会话已建立");
  }

  async function mallLogin() {
    if (mallAuthorization) return;
    const response = await request(
      MALL_HOST,
      "https://wapact.189.cn:9001/unified/user/login",
      {
        options: {
          method: "POST",
          body: JSON.stringify({
            ticket: auth.ticket || "",
            backUrl: encodeURIComponent(
              "https://wapact.189.cn:9001/JinDouMall/JinDouMall_luckDraw.html?ticket=" +
                (auth.ticket || "")
            ),
            platformCode: "P201010301",
            loginType: 2,
          }),
        },
      }
    );
    const token =
      (response.data.biz && response.data.biz.token) || response.data.token || "";
    if (!isSuccess(response.data) || !token) {
      throw new Error("金豆商城登录失败");
    }
    mallAuthorization = "Bearer " + token;
    report("金豆商城登录成功");
  }

  async function mallLottery() {
    if (!auth.ticket) {
      report("金豆商城跳过：未抓到 ticket");
      return;
    }
    await mallLogin();
    const query = await request(
      MALL_HOST,
      "https://wapact.189.cn:9001/gateway/golden/api/queryInfo?_=" + env.now(),
      { options: { method: "GET" } }
    );
    if (isSuccess(query.data)) coin = numberValue(query.data.biz && query.data.biz.totalAmount, coin);
    const turn = await request(
      MALL_HOST,
      "https://wapact.189.cn:9001/gateway/golden/api/queryTurnTable?type=1&_=" +
        env.now(),
      { options: { method: "GET" } }
    );
    const activityId =
      turn.data &&
      turn.data.biz &&
      turn.data.biz.wzTurntable &&
      turn.data.biz.wzTurntable.code;
    if (!activityId) {
      report("金豆商城未找到转盘活动");
      return;
    }
    const cost = numberValue(turn.data.biz && turn.data.biz.xiaoHaoCount, 20);
    const check = await request(
      MALL_HOST,
      "https://wapact.189.cn:9001/gateway/golden/stand/detail/check?activityId=" +
        encodeURIComponent(activityId) +
        "&_=" +
        env.now(),
      { options: { method: "GET" } }
    );
    let chances = numberValue(
      check.data &&
        check.data.biz &&
        check.data.biz.userInfo &&
        check.data.biz.userInfo.chanceCount,
      0
    );
    if (!config.ALLOW_BEAN_SPENDING) {
      report("金豆商城转盘已发现 " + chances + " 次机会；已禁止自动消耗金豆");
      return;
    }
    while (chances-- > 0 && coin >= cost) {
      const lottery = await request(
        MALL_HOST,
        "https://wapact.189.cn:9001/gateway/golden/api/lottery",
        {
          options: {
            method: "POST",
            body: JSON.stringify({ activityId }),
          },
        }
      );
      const resultCodeValue =
        lottery.data &&
        lottery.data.biz &&
        lottery.data.biz.resultCode;
      report(
        String(resultCodeValue) === "0"
          ? "金豆商城抽奖: " +
              String(
                (lottery.data.biz.resultInfo &&
                  lottery.data.biz.resultInfo.winTitle) ||
                  "奖励"
              )
          : "金豆商城抽奖失败"
      );
      coin -= cost;
      await env.wait(1000);
    }
  }

  try {
    await prepareAuth();
    report("账号 " + maskPhone(auth.phone));
    await runStage("金豆余额查询", function () {
      return userCoinInfo(false);
    });
    if (config.ENABLE_SIGN) {
      await runStage("每日签到", function () {
        return userStatusInfo();
      });
    }
    if (config.ENABLE_CONTINUE_LOTTERY) {
      await runStage("连签抽奖", function () {
        return continueSignRecords();
      });
    }
    await env.wait(1000);
    if (config.ENABLE_HOME_TASKS) {
      await runStage("首页活动任务", function () {
        return homepage();
      });
    }
    await env.wait(1000);
    if (config.ENABLE_PET_FEED) {
      await runStage("宠物喂食", function () {
        return petFeed();
      });
    }
    if (config.ENABLE_PET_RIGHTS) {
      await runStage("宠物权益", function () {
        return petRights();
      });
    }
    if (config.ENABLE_MONTHLY_GIFT) {
      await runStage("每月见面礼", function () {
        return monthlyGift();
      });
    }
    if (config.ENABLE_MALL_LOTTERY) {
      await runStage("金豆商城", function () {
        return mallLottery();
      });
    }
    await runStage("最终金豆查询", function () {
      return userCoinInfo(true);
    });
    report(stageFailed ? "部分活动失败，其余流程已完成" : "全部活动流程执行完成");
    notify(
      "电信营业厅",
      stageFailed ? "部分活动执行完成" : "活动执行完成",
      reports.slice(-12).join("\n").slice(0, 1500)
    );
    return { ok: !stageFailed, authExpired: false, reports, coin };
  } catch (error) {
    authExpired = Boolean(error && error.authExpired);
    report("执行失败: " + String((error && error.message) || error));
    notify(
      "电信营业厅",
      authExpired ? "登录态失效，请重新抓取" : "活动执行失败",
      authExpired
        ? "打开电信营业厅，进入金豆活动页后再运行任务。"
        : String((error && error.message) || error).slice(0, 800)
    );
    return { ok: false, authExpired, reports, coin };
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    aesCbcPkcs7Encrypt,
    defaultConfig,
    rsaPkcs1Encrypt,
    runDaily,
    tripleDesCbcPkcs7Encrypt,
  };
} else if (typeof $task !== "undefined" && typeof $prefs !== "undefined") {
  let telecomFinished = false;
  function telecomFinish() {
    if (telecomFinished) return;
    telecomFinished = true;
    $done({});
  }

  runDaily({
    prefs: $prefs,
    transport(request) {
      return $task.fetch(request);
    },
    notify(title, subtitle, body) {
      $notify(title, subtitle, body);
    },
    wait(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    },
    config: defaultConfig,
  })
    .catch(function (error) {
      try {
        $notify(
          "电信营业厅",
          "脚本异常",
          String((error && error.message) || error).slice(0, 800)
        );
      } catch (notifyError) {}
    })
    .finally(telecomFinish);
}
