const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const {
  captureEvent,
} = require("../telecom_capture.js");
const {
  aesCbcPkcs7Encrypt,
  defaultConfig,
  rsaPkcs1Encrypt,
  runDaily,
} = require("../qx_telecom_daily.js");

const PHONE = "13800138000";
const ENCODED_PHONE = "35:2235:222";

function memoryPrefs(initial) {
  const data = Object.assign({}, initial || {});
  return {
    valueForKey(key) {
      return data[key];
    },
    setValueForKey(value, key) {
      data[key] = value;
      return true;
    },
    snapshot() {
      return Object.assign({}, data);
    },
  };
}

function authFixture(overrides) {
  const auth = {
    phone: PHONE,
    ticket: "ticket-123",
    updatedAt: 1700000000000,
    hosts: {
      "wappark.189.cn": {
        cookie: "SESSION=abc; WAF=def",
        sign: "sign-captured",
        userAgent: "TelecomApp/10.5",
        referer: "https://wappark.189.cn/",
        capturedAt: 1700000000000,
      },
      "xbk.189.cn": {
        cookie: "XBK=abc",
        userAgent: "TelecomApp/10.5",
        capturedAt: 1700000000000,
      },
      "wapact.189.cn": {
        cookie: "MALL=abc",
        userAgent: "TelecomApp/10.5",
        capturedAt: 1700000000000,
      },
      "appfuwu.189.cn": {
        token: "app-token",
        userId: "user-123",
        userAgent: "TelecomApp/10.5",
        capturedAt: 1700000000000,
      },
    },
  };
  return Object.assign(auth, overrides || {});
}

test("capture merges encoded phone, response cookies and per-host auth", () => {
  const loginRequest = {
    request: {
      url: "https://appgologin.189.cn:9031/login/client/userLoginNormal",
      headers: {
        "User-Agent": "TelecomApp/10.5",
      },
      body: JSON.stringify({
        headerInfos: { userLoginName: ENCODED_PHONE },
        content: { fieldData: { phoneNum: ENCODED_PHONE } },
      }),
    },
  };
  let auth = captureEvent(loginRequest, {});

  auth = captureEvent(
    {
      response: {
        url: "https://appgologin.189.cn:9031/login/client/userLoginNormal",
        headers: {
          "set-cookie": [
            "LOGIN=one; Path=/; HttpOnly",
            "DEVICE=two; Path=/",
          ],
        },
      },
    },
    auth
  );

  assert.equal(auth.phone, PHONE);
  assert.match(auth.hosts["appgologin.189.cn"].cookie, /LOGIN=one/);
  assert.match(auth.hosts["appgologin.189.cn"].cookie, /DEVICE=two/);
});

test("capture keeps sign and ticket while refreshing cookies", () => {
  const previous = {
    phone: PHONE,
    hosts: {
      "wappark.189.cn": {
        cookie: "OLD=1",
        sign: "stable-sign",
        userAgent: "old-ua",
      },
    },
  };

  const next = captureEvent(
    {
      request: {
        url:
          "https://wappark.189.cn/jt-sign/ssoHomLogin?ticket=ticket-456",
        headers: {
          Cookie: "NEW=2",
          "User-Agent": "new-ua",
        },
      },
    },
    previous
  );

  assert.equal(next.hosts["wappark.189.cn"].cookie, "NEW=2");
  assert.equal(next.hosts["wappark.189.cn"].sign, "stable-sign");
  assert.equal(next.hosts["wappark.189.cn"].userAgent, "new-ua");
  assert.equal(next.ticket, "ticket-456");
});

test("capture extracts a phone nested inside a WAP cookie", () => {
  const next = captureEvent(
    {
      request: {
        url: "https://wappark.189.cn/jt-sign/webSign/homepage",
        headers: {
          Cookie: "userInfo=" + encodeURIComponent('{"mobile":"13800138000"}'),
          sign: "sign-captured",
        },
      },
    },
    {}
  );

  assert.equal(next.phone, PHONE);
});

test("capture stores sign returned by the WAP SSO response body", () => {
  const next = captureEvent(
    {
      response: {
        url: "https://wappark.189.cn/jt-sign/ssoHomLogin?ticket=ticket-1",
        headers: {},
        body: JSON.stringify({ resoultCode: 0, sign: "body-sign" }),
      },
    },
    { phone: PHONE }
  );

  assert.equal(next.hosts["wappark.189.cn"].sign, "body-sign");
});

test("capture extracts a phone from a non-JSON app login XML body", () => {
  const next = captureEvent(
    {
      request: {
        url: "https://appgologin.189.cn:9031/map/clientXML",
        headers: {},
        body:
          "<Request><UserLoginName>13800138000</UserLoginName></Request>",
      },
    },
    {}
  );

  assert.equal(next.phone, PHONE);
});

test("capture extracts a phone from a JWT sign token", () => {
  const payload = Buffer.from(
    JSON.stringify({ phone: PHONE, exp: 1700000000 })
  ).toString("base64url");
  const next = captureEvent(
    {
      request: {
        url: "https://wappark.189.cn/jt-sign/webSign/homepage",
        headers: {
          Cookie: "SESSION=abc",
          sign: "header." + payload + ".signature",
        },
      },
    },
    {}
  );

  assert.equal(next.phone, PHONE);
});

test("capture stores login token and userId from a nested response body", () => {
  const next = captureEvent(
    {
      response: {
        url: "https://appgologin.189.cn:9031/login/client/userLoginNormal",
        headers: { "set-cookie": ["LOGIN=one; Path=/"] },
        body: JSON.stringify({
          responseData: {
            data: {
              loginSuccessResult: {
                token: "login-token-1",
                userId: "login-user-1",
              },
            },
          },
        }),
      },
    },
    {}
  );

  assert.equal(next.hosts["appgologin.189.cn"].token, "login-token-1");
  assert.equal(next.hosts["appgologin.189.cn"].userId, "login-user-1");
});

test("AES sign payload uses the service CBC key and zero IV", () => {
  const plaintext = JSON.stringify({
    phone: PHONE,
    date: 1700000000000,
    sysType: "20002",
  });
  const encrypted = aesCbcPkcs7Encrypt(
    plaintext,
    "34d7cb0bcdf07523",
    Buffer.alloc(16)
  );
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    Buffer.from("34d7cb0bcdf07523"),
    Buffer.alloc(16)
  );
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]).toString("utf8");
  assert.equal(decrypted, plaintext);
});

test("RSA parameter encryption produces a valid PKCS1 payload", () => {
  const publicKey =
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDYMFcvke9UW+vMWwOpo7K3ez/H" +
    "BzFV/SdWOzWKUzQ087lIH2bTbxFuIzYiYhvV7kdOpJgxzLtxn3++kUvD3mrtu7RG" +
    "3iqy0dKnEVpnlTPV5NQqM2N3fd/V+U0p6TukCJGUr2Tt3u1kbEmT+iC9BNSUk0md" +
    "AeRD7rhoM/uut0xshwIDAQAB";
  const privateKey = `-----BEGIN PRIVATE KEY-----
MIICdQIBADANBgkqhkiG9w0BAQEFAASCAl8wggJbAgEAAoGBANgwVy+R71Rb68xb
A6mjsrd7P8cHMVX9J1Y7NYpTNDTzuUgfZtNvEW4jNiJiG9XuR06kmDHMu3Gff76R
S8Peau27tEbeKrLR0qcRWmeVM9Xk1CozY3d939X5TSnpO6QIkZSvZO3e7WRsSZP6
IL0E1JSTSZ0B5EPuuGgz+663TGyHAgMBAAECgYBgcsCS0nKJmjDKjNhHeGalAPFl
I8pY6IYCLIwoWBJ0hT9l88x2C5klH8Ro9oggmxto9HmJziLaACSHql641aOx9f3d
0PH6gALMYX7nAhNbryCm/Sx8p/wssoVSjTnEJ1XJ4VFol/RRuqv+RApyiKwdZ6Ch
dRxW39narb0wXmiVAQJBAPPkJwP2xTZDmil2HPrpNFBsEkOe97GiMTLAJNG2ZSex
DOckq/IhDBXi/NqLK9JV35TiRbhFsXwFudrozr5Ra8cCQQDi7BeG/X1pbfw/9pGn
15m69sIhyO5cbEDQaN3p+GyFakzGxM1xwTXmu4w2o/3Yld+90jQyZqh5zR5jyroL
2XlBAkAcuceaoOsTfBzhO0coimUd/8ya6FNWObs/tf/gL3J0nVbetqQF7byFq2mK
uA+eQ30FBS2fCZ5g9C+yx+7p3Z8rAkB15tsWjTCTDc1JYpAtV80NIladfSuzo59N
aZ8biLLB4wg/IlPoLc4Wsw1X+n7TAJP+qW/rXAFfP57xlIxzyavBAkAGSCpcG+k7
yjoxZvwJ8XODxUmXSTTqZ/CEHigOsB4idI+4K8OExzgZ+fh50aAIMEF1nu22ooy6
HanJlc3gJn6J
-----END PRIVATE KEY-----`;

  const encrypted = rsaPkcs1Encrypt("hello-qx", publicKey);
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(encrypted, "base64")
  );
  assert.equal(decrypted.toString("utf8"), "hello-qx");
});

test("runDaily reaches every advertised Telecom activity", async () => {
  const prefs = memoryPrefs();
  prefs.setValueForKey(JSON.stringify(authFixture()), "qx_telecom_auth");
  const notifications = [];
  const hits = [];
  let foodCount = 0;
  let liveCount = 0;

  function json(value, statusCode) {
    return {
      statusCode: statusCode || 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    };
  }

  async function transport(request) {
    const url = String(request.url);
    hits.push(url);

    if (url.includes("/api/home/userCoinInfo")) {
      return json({ resoultCode: 0, totalCoin: 100 });
    }
    if (url.includes("/api/home/userStatusInfo")) {
      return json({ resoultCode: 0, data: { isSign: false, signDay: 8 } });
    }
    if (url.includes("/webSign/sign")) {
      return json({ resoultCode: 0, data: { code: 1, coin: 5 } });
    }
    if (url.includes("/webSign/continueSignRecords")) {
      return json({
        resoultCode: 0,
        continue15List: [{}],
        continue28List: [{}],
      });
    }
    if (url.includes("/webSign/exchangePrize")) {
      return json({
        resoultCode: 0,
        prizeDetail: { code: 0, biz: { winTitle: "金豆" } },
      });
    }
    if (url.includes("/webSign/homepage")) {
      return json({
        resoultCode: 0,
        data: {
          head: { code: 0 },
          biz: {
            adItems: [
              {
                contentOne: "3",
                title: "任务奖励",
                rewardId: "reward-1",
                taskState: "0",
              },
              {
                contentOne: "5",
                title: "消息任务",
                taskState: "0",
              },
              {
                contentOne: "6",
                title: "分享任务",
                taskState: "0",
              },
              {
                contentOne: "10",
                title: "直播任务",
                taskState: "0",
              },
              {
                contentOne: "31",
                title: "短视频任务",
                taskState: "0",
                articleId: "video-1",
              },
              {
                contentOne: "81",
                title: "聚合任务",
                taskId: "job-1",
                taskState: "0",
              },
              {
                liveId: "room-1",
                title: "点赞任务",
                taskState: "0",
              },
            ],
          },
        },
      });
    }
    if (url.includes("/paradise/receiveReward")) {
      return json({ resoultCode: 0, resoultMsg: "success" });
    }
    if (url.includes("/paradise/openMsg")) {
      return json({ resoultCode: 0, resoultMsg: "success" });
    }
    if (url.includes("/webSign/polymerize")) {
      return json({ resoultCode: 0, resoultMsg: "success" });
    }
    if (url.includes("/query/sharingGetGold")) {
      return json({ responseData: { resultCode: "0000" } });
    }
    if (url.includes("/paradise/getParadiseInfo")) {
      return json({
        resoultCode: 0,
        userInfo: {
          levelInfoMap: {
            level: 6,
            growthValue: 99,
            fullGrowthCoinValue: 100,
          },
        },
      });
    }
    if (url.includes("/paradise/food")) {
      foodCount += 1;
      return json({ resoultCode: 0, resoultMsg: "feed-" + foodCount });
    }
    if (url.includes("/paradise/getLevelRightsList")) {
      return json({
        currentLevel: 6,
        V6: [
          {
            id: "rights-1",
            righstName: "2元话费",
            costCoin: 10,
            receiveType: 1,
          },
        ],
      });
    }
    if (url.includes("/paradise/getConversionRights")) {
      return json({ code: 200, rightsStatus: "可领取" });
    }
    if (url.includes("/paradise/conversionRights")) {
      return json({ resoultCode: 0 });
    }
    if (url.includes("/ssoHomLoginCommon")) {
      return json({
        resoultCode: 0,
        resoultMsg: "已经登录",
        accId: "acc-1",
      });
    }
    if (url.includes("/welfare/check")) {
      return json({ resoultCode: 0, data: { flag: "gift-flag" } });
    }
    if (url.includes("/welfare/getInfo")) {
      return json({
        resoultCode: 0,
        data: [{ title: "每月见面礼" }],
      });
    }
    if (url.includes("/welfare/receive")) {
      return json({ resoultCode: 0, resoultMsg: "已领取" });
    }
    if (url.includes("/lottery/getCount")) {
      return json({ code: 0, video: [{ videoType: 202201 }] });
    }
    if (url.includes("/lottery/addVideoCount")) {
      return json({ code: 0 });
    }
    if (url.includes("/welfare/receiveInfo")) {
      return json({
        resoultCode: 0,
        data: [{ prizeName: "见面礼券" }],
      });
    }
    if (url.includes("/lottery/refresh")) {
      return json({ resoultCode: -1, rNumber: 1 });
    }
    if (url.includes("/lottery/lotteryRevice")) {
      return json({ code: 0, rname: "1元话费" });
    }
    if (url.includes("/xbkapi/api/auth/jump")) {
      return {
        statusCode: 302,
        headers: { location: "https://xbk.189.cn/home?usercode=code-1" },
        body: "",
      };
    }
    if (url.includes("/api/auth/userinfo/codeToken")) {
      return json({ code: 0, data: { token: "xbk-token" } });
    }
    if (url.includes("/watchLiveInit")) {
      liveCount += 1;
      return json({ code: 0, data: "live-key" });
    }
    if (url.includes("/watchLive")) {
      return json({ code: 0 });
    }
    if (url.includes("/watchVideo")) {
      return json({ code: 0 });
    }
    if (url.includes("/room/like")) {
      return json({ code: 0 });
    }
    if (url.includes("/unified/user/login")) {
      return json({ code: 0, biz: { token: "mall-token" } });
    }
    if (url.includes("/api/queryInfo")) {
      return json({ code: 0, biz: { totalAmount: 100 } });
    }
    if (url.includes("/api/queryTurnTable")) {
      return json({
        code: 0,
        biz: { xiaoHaoCount: 20, wzTurntable: { code: "activity-1" } },
      });
    }
    if (url.includes("/stand/detail/check")) {
      return json({
        code: 0,
        biz: { userInfo: { chanceCount: 1 } },
      });
    }
    if (url.includes("/api/lottery")) {
      return json({
        code: 0,
        biz: {
          resultCode: "0",
          resultInfo: { winTitle: "5金豆" },
        },
      });
    }

    throw new Error("unexpected request: " + url);
  }

  const result = await runDaily({
    prefs,
    transport,
    notify(title, subtitle, body) {
      notifications.push({ title, subtitle, body });
    },
    wait: async function () {},
    now: function () {
      return 1700000000000;
    },
    config: Object.assign({}, defaultConfig, {
      ALLOW_BEAN_SPENDING: true,
      ENABLE_MONTHLY_GIFT: true,
      ENABLE_MEDIA_TASKS: true,
      ENABLE_PET_RIGHTS: true,
      ENABLE_MALL_LOTTERY: true,
    }),
  });

  const expectedPaths = [
    "/api/home/userStatusInfo",
    "/webSign/sign",
    "/webSign/continueSignRecords",
    "/webSign/exchangePrize",
    "/webSign/homepage",
    "/paradise/receiveReward",
    "/paradise/openMsg",
    "/query/sharingGetGold",
    "/watchLiveInit",
    "/watchLive",
    "/watchVideo",
    "/room/like",
    "/webSign/polymerize",
    "/paradise/getParadiseInfo",
    "/paradise/food",
    "/paradise/getLevelRightsList",
    "/paradise/getConversionRights",
    "/paradise/conversionRights",
    "/ssoHomLoginCommon",
    "/welfare/check",
    "/welfare/getInfo",
    "/welfare/receive",
    "/lottery/getCount",
    "/lottery/addVideoCount",
    "/welfare/receiveInfo",
    "/lottery/refresh",
    "/lottery/lotteryRevice",
    "/api/auth/jump",
    "/api/auth/userinfo/codeToken",
    "/unified/user/login",
    "/api/queryInfo",
    "/api/queryTurnTable",
    "/stand/detail/check",
    "/api/lottery",
  ];
  for (const path of expectedPaths) {
    assert.ok(
      hits.some((url) => url.includes(path)),
      "missing activity endpoint " + path
    );
  }
  const giftInfoIndex = hits.findIndex((url) =>
    url.includes("/welfare/getInfo")
  );
  const giftCheckIndex = hits.findIndex((url) =>
    url.includes("/welfare/check")
  );
  assert.ok(
    giftInfoIndex >= 0 && giftInfoIndex < giftCheckIndex,
    "monthly gift entitlement info must load before claiming"
  );
  assert.equal(foodCount, 10);
  assert.equal(liveCount, 1);
  assert.equal(result.ok, true);
  assert.ok(notifications.some((item) => item.title.includes("电信")));
});

test("runDaily reports an expired live auth instead of retrying forever", async () => {
  const prefs = memoryPrefs();
  prefs.setValueForKey(JSON.stringify(authFixture()), "qx_telecom_auth");
  const notifications = [];

  const result = await runDaily({
    prefs,
    transport: async function () {
      return {
        statusCode: 412,
        headers: {},
        body: "<html>challenge</html>",
      };
    },
    notify(title, subtitle, body) {
      notifications.push({ title, subtitle, body });
    },
    wait: async function () {},
    now: function () {
      return 1700000000000;
    },
    config: Object.assign({}, defaultConfig, {
      ENABLE_MONTHLY_GIFT: false,
      ENABLE_MEDIA_TASKS: false,
      ENABLE_PET_RIGHTS: false,
      ENABLE_MALL_LOTTERY: false,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.authExpired, true);
  assert.ok(
    notifications.some(
      (item) =>
        String(item.subtitle).includes("登录态") ||
        String(item.subtitle).includes("抓取")
    )
  );
});

test("a non-auth activity failure does not block later activities", async () => {
  const prefs = memoryPrefs();
  prefs.setValueForKey(JSON.stringify(authFixture()), "qx_telecom_auth");
  const hits = [];
  const notifications = [];

  const result = await runDaily({
    prefs,
    transport: async function (request) {
      const url = String(request.url);
      hits.push(url);
      if (url.includes("/api/home/userCoinInfo")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ resoultCode: 0, totalCoin: 10 }),
        };
      }
      if (url.includes("/webSign/homepage")) {
        throw new Error("homepage temporarily unavailable");
      }
      if (url.includes("/paradise/getParadiseInfo")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            resoultCode: 0,
            userInfo: { levelInfoMap: { level: 2 } },
          }),
        };
      }
      if (url.includes("/paradise/food")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ resoultCode: 1, msg: "最大喂食次数" }),
        };
      }
      return {
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ resoultCode: 0 }),
      };
    },
    notify(title, subtitle) {
      notifications.push({ title, subtitle });
    },
    wait: async function () {},
    now: function () {
      return 1700000000000;
    },
    config: Object.assign({}, defaultConfig, {
      ENABLE_MONTHLY_GIFT: false,
      ENABLE_MEDIA_TASKS: false,
      ENABLE_PET_RIGHTS: false,
      ENABLE_MALL_LOTTERY: false,
    }),
  });

  assert.equal(result.authExpired, false);
  assert.equal(result.ok, false);
  assert.ok(hits.some((url) => url.includes("/paradise/getParadiseInfo")));
  assert.ok(notifications.some((item) => item.subtitle.includes("部分")));
});

test("mall lottery reads xiaoHaoCount instead of a hard-coded cost", async () => {
  const prefs = memoryPrefs();
  prefs.setValueForKey(JSON.stringify(authFixture()), "qx_telecom_auth");
  let lotteryCalls = 0;

  const result = await runDaily({
    prefs,
    transport: async function (request) {
      const url = String(request.url);
      if (url.includes("/api/home/userCoinInfo")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ resoultCode: 0, totalCoin: 10 }),
        };
      }
      if (url.includes("/api/home/userStatusInfo")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ resoultCode: 0, data: { isSign: true } }),
        };
      }
      if (url.includes("/unified/user/login")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ code: 0, biz: { token: "mall-token" } }),
        };
      }
      if (url.includes("/api/queryInfo")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ code: 0, biz: { totalAmount: 10 } }),
        };
      }
      if (url.includes("/api/queryTurnTable")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            code: 0,
            biz: {
              xiaoHaoCount: 5,
              wzTurntable: { code: "activity-1" },
            },
          }),
        };
      }
      if (url.includes("/stand/detail/check")) {
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            code: 0,
            biz: { userInfo: { chanceCount: 1 } },
          }),
        };
      }
      if (url.includes("/api/lottery")) {
        lotteryCalls += 1;
        return {
          statusCode: 200,
          headers: {},
          body: JSON.stringify({
            code: 0,
            biz: {
              resultCode: "0",
              resultInfo: { winTitle: "1金豆" },
            },
          }),
        };
      }
      return {
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ resoultCode: 0 }),
      };
    },
    notify() {},
    wait: async function () {},
    now: function () {
      return 1700000000000;
    },
    config: Object.assign({}, defaultConfig, {
      ENABLE_CONTINUE_LOTTERY: false,
      ENABLE_HOME_TASKS: false,
      ENABLE_PET_FEED: false,
      ENABLE_PET_RIGHTS: false,
      ENABLE_MONTHLY_GIFT: false,
      ENABLE_MEDIA_TASKS: false,
      ALLOW_BEAN_SPENDING: true,
    }),
  });

  assert.equal(lotteryCalls, 1);
  assert.equal(result.ok, true);
});

test("Quantumult X entry finishes cleanly when auth has not been captured", async () => {
  const source = fs.readFileSync(
    require.resolve("../qx_telecom_daily.js"),
    "utf8"
  );
  const notifications = [];
  let finished = 0;
  const sandbox = {
    console: { log() {} },
    Promise,
    setTimeout,
    clearTimeout,
    BigInt,
    $prefs: {
      valueForKey() {
        return "";
      },
      setValueForKey() {
        return true;
      },
    },
    $task: {
      async fetch() {
        throw new Error("network should not run without auth");
      },
    },
    $notify(title, subtitle, body) {
      notifications.push({ title, subtitle, body });
    },
    $done() {
      finished += 1;
    },
  };

  vm.runInNewContext(source, sandbox, { filename: "qx_telecom_daily.js" });
  for (let i = 0; i < 20 && finished === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.equal(finished, 1);
  assert.ok(
    notifications.some((item) => String(item.subtitle).includes("抓取"))
  );
});

test("capture response-body mode preserves the original response body", () => {
  const source = fs.readFileSync(
    require.resolve("../telecom_capture.js"),
    "utf8"
  );
  let doneBody = null;
  const responseBody = JSON.stringify({
    responseData: { data: { loginSuccessResult: { token: "token-2" } } },
  });
  const sandbox = {
    console: { log() {} },
    JSON,
    Date,
    $prefs: {
      valueForKey() {
        return "";
      },
      setValueForKey() {},
    },
    $request: null,
    $response: {
      url: "https://appgologin.189.cn:9031/login/client/userLoginNormal",
      headers: {},
      body: responseBody,
    },
    $notify() {},
    $done(value) {
      doneBody = value && value.body;
    },
  };

  vm.runInNewContext(source, sandbox, { filename: "telecom_capture.js" });
  assert.equal(doneBody, responseBody);
});

test("capture request-body mode preserves the original request body", () => {
  const source = fs.readFileSync(
    require.resolve("../telecom_capture.js"),
    "utf8"
  );
  let doneBody = null;
  const requestBody =
    "<Request><UserLoginName>13800138000</UserLoginName></Request>";
  const sandbox = {
    console: { log() {} },
    JSON,
    Date,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    $prefs: {
      valueForKey() {
        return "";
      },
      setValueForKey() {},
    },
    $request: {
      url: "https://appgologin.189.cn:9031/map/clientXML",
      headers: {},
      body: requestBody,
    },
    $response: null,
    $notify() {},
    $done(value) {
      doneBody = value && value.body;
    },
  };

  vm.runInNewContext(source, sandbox, { filename: "telecom_capture.js" });
  assert.equal(doneBody, requestBody);
});

test("WAP capture reports the missing field instead of staying silent", () => {
  const source = fs.readFileSync(
    require.resolve("../telecom_capture.js"),
    "utf8"
  );
  const notifications = [];
  const sandbox = {
    console: { log() {} },
    JSON,
    Date,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    $prefs: {
      valueForKey() {
        return "";
      },
      setValueForKey() {},
    },
    $request: {
      url: "https://wappark.189.cn/jt-sign/webSign/homepage",
      headers: {
        Cookie: "SESSION=abc",
        sign: "sign-captured",
      },
    },
    $response: null,
    $notify(title, subtitle, body) {
      notifications.push({ title, subtitle, body });
    },
    $done() {},
  };

  vm.runInNewContext(source, sandbox, { filename: "telecom_capture.js" });
  assert.ok(
    notifications.some(
      (item) =>
        String(item.subtitle).includes("不完整") &&
        String(item.body).includes("手机号")
    )
  );
});
