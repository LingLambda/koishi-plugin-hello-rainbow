import { Schema } from "koishi";
import { Rainbow } from "./service";

export const name = "hello-rainbow";
export const inject = ["http"];
export const usage = `
<h2>插件使用 <a href="https://www.seniverse.com">心知天气API</a> 使用前请先注册</h2>
<h3>使用方法：</h3>
<code>天气 北京 </code><span>获取北京天气</span><br/>
<p>更多使用方法见 </p><code>天气 -h</code>
`;
export interface Config {
  baseurl: string;
  privateKey: string;
  publicKey: string;
  encodeType: "公钥" | "私钥";
  defaultDay: number;
}

export const Config: Schema<Config> = Schema.object({
  baseurl: Schema.string()
    .description("api路径")
    .default("https://api.seniverse.com/v3"),
  privateKey: Schema.string()
    .role("secret")
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

declare module "koishi" {
  interface Context {
    rainbow: Rainbow;
  }
}
