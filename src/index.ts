import { Context, Schema, Session } from "koishi";
import Papa from "papaparse";
import * as fs from "fs";
import * as path from "path";
export const name = "hello-rainbow";

export const inject = ["http"];

export interface Config {
  baseurl: string;
  apiKey: string;
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
    .default("https://api.seniverse.com/v3/weather/now.json"),
  apiKey: Schema.string().description("api公钥/私钥").default(""),
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

let citys: Map<string, Citys>;

export function apply(ctx: Context, config: Config) {
  let req = async (
    ctx: Context,
    config: Config,
    session: Session,
    city: string,
    day: number
  ) => "";
  if (config.encodeType === "公钥") {
    req = publicRequest;
  } else if (config.encodeType === "私钥") {
    req = privateRequest;
  }
  const _citys = initCityFile().data;
  //构建成哈希表优化查询效率
  citys = new Map(_citys.map((item) => [item.城市简称.split("/").pop(), item]));

  ctx
    .command("天气 <city> <day>", "获取指定城市天气")
    .action(async ({ session }, city, day) => {
      const cityId = await queryCityId(city);
      if (!cityId) {
        await session.send(`未找到${city}`);
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

const privateRequest = async (
  ctx: Context,
  config: Config,
  session: Session,
  city: string,
  day: number
) => {
  const { baseurl, apiKey } = config;

  try {
    const res = await ctx.http.get(baseurl, {
      params: {
        key: apiKey,
        location: city,
        start: 0,
        days: day,
      },
    });
    console.log(res);
    const weatherArr = res.results[0].daily;
    if (weatherArr && weatherArr.length < day) {
      session.send(
        `免费用户只能获取最近3天的信息：\n${toHumanReadable(weatherArr)}`
      );
      return;
    }
    await session.send(toHumanReadable(weatherArr) || "收到的返回为空");
    return;
  } catch (err) {
    console.log(err);
    if (err.response && err.response.status === 403) {
      await session.send("🔒 请求被拒绝 请检查密钥设置");
    } else if (err.response && err.response.status === 404) {
      await session.send("🚫 请求失败 请检查url设置");
    } else {
      await session.send("❌ 未知错误，请查看日志！");
      ctx.logger.error(err);
    }
  }
  return "";
};

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

// https://api.seniverse.com/v3/weather/daily.json?key=your_api_key&location=beijing&language=zh-Hans&unit=c&start=0&days=5
const publicRequest = async (
  ctx: Context,
  config: Config,
  session: Session,
  city: string,
  day: number
) => {
  const ts = Math.round(Date.now() / 1000);
  const ttl = 600;
  const latitude = 29.5617;
  const longitude = 120.0962;
  let url = "https://api.seniverse.com/v4?fields=precip_minutely";
  session.send(citys.get(city).行政归属);
  return "";
};

const initCityFile = (): { data: Citys[] } => {
  const citysStr = fs.readFileSync(path.join(__dirname, "citys.csv"), "utf-8");
  return Papa.parse(citysStr, { header: true, skipEmptyLines: true });
};

const queryCityId = async (city: string) => {
  city = city.replaceAll("市", "").replaceAll("区", "");
  if (city.includes("/")) {
    for (const [_, value] of citys.entries()) {
      if (value.城市简称.endsWith(city)) {
        return value.城市ID;
      }
    }
  } else {
    return citys.get(city).城市ID;
  }
};
