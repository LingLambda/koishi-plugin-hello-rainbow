import { Context, Service } from "koishi";
import { privateRequest, publicRequest, queryCityId } from ".";

declare module "koishi" {
  interface Context {
    rainbow: Rainbow;
  }
}

export class Rainbow extends Service {
  constructor(ctx: Context) {
    super(ctx, "rainbow");
  }
  start() {}
  async request(
    encodeType: "公钥" | "私钥",
    city: string,
    day?: string | number
  ) {
    const req = encodeType === "公钥" ? publicRequest : privateRequest;
    const cityId = await queryCityId(city);
    if (!cityId) {
      return `未找到城市：${city} 区级请用 北京/朝阳 写法`;
    }
    const { baseurl, privateKey, publicKey, defaultDay } = this.config;
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
