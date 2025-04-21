import { Context, Schema, Session } from "koishi";
import Papa from "papaparse";
import * as fs from "fs";
import * as path from "path";
export const name = "hello-rainbow";

import crypto from "crypto";
import queryString from "query-string";

export const inject = ["http"];

export interface Config {
  baseurl: string;
  privateKey: string;
  publicKey: string;
  encodeType: "公钥" | "私钥";
  defaultDay: number;
}

interface Citys {
  序号: string;
  城市ID: string;
  行政归属: string;
  城市简称: string;
  拼音: string;
  lat: string;
  lon: string;
}

interface WeatherData {
  date: string; // 日期，例如 "2025-04-21"
  text_day: string; // 白天天气现象文字，例如 "小雨"
  code_day: string; // 白天天气现象代码，例如 "13"
  text_night: string; // 晚上天气现象文字，例如 "多云"
  code_night: string; // 晚上天气现象代码，例如 "4"
  high: string; // 最高温度（单位：℃），例如 "18"
  low: string; // 最低温度（单位：℃），例如 "12"
  rainfall: string; // 日累计降水量（单位：mm），例如 "1.28"
  precip: string; // 降水概率（单位：0-1），例如 "0.88"
  wind_direction: string; // 风向文字，例如 "北"
  wind_direction_degree: string; // 风向角度，例如 "0"
  wind_speed: string; // 风速（单位：km/h），例如 "8.4"
  wind_scale: string; // 风力等级，例如 "2"
  humidity: string; // 湿度（单位：百分比），例如 "78"
}

export const Config: Schema<Config> = Schema.object({
  baseurl: Schema.string()
    .description("api路径")
    .default("https://api.seniverse.com/v3"),
  privateKey: Schema.string()
    .description("api私钥（无论使用公钥还是私钥加密都是必须的！）")
    .default(""),
  publicKey: Schema.string()
    .description("api公钥（仅在公钥加密时需要）")
    .default(""),
  encodeType: Schema.union(["公钥", "私钥"])
    .role("")
    .description("建议使用公钥加密更安全")
    .default("私钥"),
  defaultDay: Schema.number()
    .description("默认获取最近多少天的天气")
    .default(3)
    .min(0)
    .max(31),
});

let citys: Citys[];

export function apply(ctx: Context, config: Config) {
  let req = async (
    ctx: Context,
    config: Config,
    session: Session,
    city: string,
    day: number
  ) => null;
  if (config.encodeType === "公钥") {
    req = publicRequest;
  } else if (config.encodeType === "私钥") {
    req = privateRequest;
  }
  citys = initCityFile().data;
  ctx
    .command("天气 <city> [day]", "获取指定城市天气")
    .alias("weather")
    .action(async ({ session }, city, day?) => {
      const cityId = await queryCityId(city);
      if (!cityId) {
        await session.send(`未找到城市：${city} 区级请用 北京/朝阳 写法`);
        return;
      }
      let dayNum = config.defaultDay;
      if (day) {
        dayNum = Number(day);
        if (!Number.isInteger(dayNum) || dayNum <= 0) {
          await session.send(`${day} 并非合法天数`);
          return;
        }
      }
      await req(ctx, config, session, cityId, dayNum);
    })
    .example("天气 北京 获取北京天气")
    .example("天气 北京 5 获取最近5天的北京天气")
    .example("天气 北京/朝阳  获取北京市朝阳区天气");
}

const initCityFile = (): { data: Citys[] } => {
  const citysStr = fs.readFileSync(path.join(__dirname, "citys.csv"), "utf-8");
  const citys: { data: Citys[] } = Papa.parse(citysStr, {
    header: true,
    skipEmptyLines: true,
  });
  return citys;
};

const privateRequest = async (
  ctx: Context,
  config: Config,
  session: Session,
  city: string,
  day: number
) => {
  let { baseurl, privateKey } = config;
  baseurl = baseurl.endsWith("/") ? baseurl.slice(0, -1) : baseurl;
  baseurl += "/weather/daily.json";

  let res: { results: { daily: any; }[]; };
  try {
    res = await ctx.http.get(baseurl, {
      params: {
        key: privateKey,
        location: city,
        start: 0,
        days: day,
      },
    });
  } catch (err) {
    if (err.response && err.response.status === 403) {
      session.send("🔒 请求被拒绝 查询的是付费区域或密钥设置错误");
    } else if (err.response && err.response.status === 404) {
      session.send("🚫 请求失败 请检查url设置");
    } else {
      session.send("❌ 未知错误，请查看日志！");
      ctx.logger.error(err);
    }
    return;
  }

  await sendInfoToUser(res, session, day);
  return;
};

const publicRequest = async (
  ctx: Context,
  config: Config,
  session: Session,
  city: string,
  day: number
) => {
  const { privateKey, publicKey } = config;
  let baseurl = config.baseurl;
  baseurl = baseurl.endsWith("/") ? baseurl.slice(0, -1) : baseurl;
  baseurl += "/weather/daily.json";
  const ts = Math.round(Date.now() / 1000);
  const ttl = 60;

  const url = signUrl(baseurl, privateKey, {
    ttl,
    ts,
    public_key: publicKey,
    location: city,
    start: 0,
    days: day,
  });
  let res: { results: { daily: any; }[]; };
  try {
    res = await ctx.http.get(url.toString());
  } catch (err) {
    if (err.response && err.response.status === 403) {
      session.send("🔒 请求被拒绝 查询的是付费区域或密钥设置错误");
    } else if (err.response && err.response.status === 404) {
      session.send("🚫 请求失败 请检查url设置");
    } else {
      session.send("❌ 未知错误，请查看日志！");
      ctx.logger.error(err);
    }
    return;
  }
  await sendInfoToUser(res, session, day);
  return;
};

const sendInfoToUser = async (
  res: { results: { daily: any }[] },
  session: Session,
  day: number
) => {
  const weatherArr = res?.results[0]?.daily;
  if (!weatherArr) {
    await session.send("收到的返回为空");
    return;
  }
  if (weatherArr.length < day) {
    await session.send(
      `免费用户只能获取最近3天的信息：\n${toHumanReadable(weatherArr)}`
    );
    return;
  }
  await session.send(toHumanReadable(weatherArr));
  return;
};

// 心知 V4 接口签名
export function signUrl(
  baseurl: string,
  privateKey: string,
  paramsObj: Record<string, string | number | boolean> = {}
): URL {
  if (!baseurl) return;

  const obj = new URL(baseurl);

  // 合并用户参数到 URL 查询参数中
  for (const [key, value] of Object.entries(paramsObj)) {
    obj.searchParams.set(key, String(value));
  }

  // 构造用于签名的原始 query 字符串（确保顺序）
  const sortedParams = Array.from(obj.searchParams.entries()).sort();
  const rawQuery = sortedParams.map(([k, v]) => `${k}=${v}`).join("&");

  // 生成 HMAC-SHA1 签名并编码
  const sig = crypto
    .createHmac("sha1", privateKey)
    .update(rawQuery, "utf8")
    .digest("base64");

  obj.searchParams.set("sig", sig);

  return obj;
}

const toHumanReadable = (dataArr: WeatherData[]) => {
  let res = "";
  // 瑞典日期格式，默认为2025-01-01这种格式
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Shanghai",
  });

  for (const data of dataArr) {
    const {
      date,
      text_day,
      code_day,
      text_night,
      code_night,
      high,
      low,
      rainfall,
      precip,
      wind_direction,
      wind_direction_degree,
      wind_speed,
      wind_scale,
      humidity,
    } = data;
    res += `
    ${date === today ? date + "（今天）" : date}
    天气：${text_day === text_night ? text_day : `${text_day} 转 ${text_night}`}
    温度：${low} - ${high}
    湿度：${humidity}
    ${wind_direction}风${wind_scale}级
    `;
  }

  return res;
};

const queryCityId = async (city: string) => {
  city = city.replaceAll("市", "").replaceAll("区", "").trim();
  for (const item of citys) {
    if (item.城市简称.trim().endsWith(city)) {
      return item.城市ID;
    }
  }
};
