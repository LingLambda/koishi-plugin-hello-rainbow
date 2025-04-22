import { Context, Service } from "koishi";
import { initCityFile, privateRequest, publicRequest, queryCityId } from ".";

export class Rainbow extends Service {
  constructor(ctx: Context, config) {
    super(ctx, "rainbow");
    this.config = config;
    initCityFile();
  }
  start() {}
  async getWeather(city: string, day?: string | number) {
    const { baseurl, encodeType, privateKey, publicKey, defaultDay } =
      this.config;
    const req = encodeType === "公钥" ? publicRequest : privateRequest;
    const cityId = await queryCityId(city);
    if (!cityId) {
      return `未找到城市：${city} 区级请用 北京/朝阳 写法`;
    }
    let dayNum = day ? Number(day) : defaultDay;
    if (!Number.isInteger(dayNum) || dayNum <= 0) {
      return `${day} 并非合法天数`;
    }
    return await req(this.ctx, baseurl, privateKey, publicKey, cityId, dayNum);
  }
}

namespace Rainbow {
  export interface Config {
    baseurl: string;
    privateKey: string;
    publicKey: string;
    encodeType: "公钥" | "私钥";
    defaultDay: number;
  }
}
