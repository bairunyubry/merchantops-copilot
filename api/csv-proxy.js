import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
//#region server/csvProxy.ts
var MAX_BYTES = 5242880;
var TIMEOUT_MS = 1e4;
var MAX_REDIRECTS = 3;
var PublicCsvError = class extends Error {
	constructor(message, status = 422) {
		super(message);
		this.name = "PublicCsvError";
		this.status = status;
	}
};
function isPrivateIpv4(address) {
	const parts = address.split(".").map(Number);
	if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
	const [a, b] = parts;
	return a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
}
function isPrivateAddress(address) {
	if (isIP(address) === 4) return isPrivateIpv4(address);
	if (isIP(address) === 6) {
		const normalized = address.toLowerCase();
		return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
	}
	return true;
}
function validatePublicCsvUrl(value) {
	if (typeof value !== "string" || value.length > 2048) throw new PublicCsvError("请输入有效的公开 CSV 链接。");
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new PublicCsvError("链接格式不正确。");
	}
	if (url.protocol !== "https:") throw new PublicCsvError("仅支持 HTTPS 公开链接。");
	if (url.username || url.password) throw new PublicCsvError("链接中不能包含账号或密码。");
	const hostname = url.hostname.toLowerCase();
	if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new PublicCsvError("不能读取本机或内网地址。");
	if (isIP(hostname) && isPrivateAddress(hostname)) throw new PublicCsvError("不能读取本机或内网地址。");
	return url;
}
async function assertPublicDns(url) {
	const addresses = await lookup(url.hostname, { all: true });
	if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw new PublicCsvError("目标域名解析到了本机或内网地址。");
}
async function fetchPublicCsv(value) {
	let url = validatePublicCsvUrl(value);
	for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
		await assertPublicDns(url);
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let response;
		try {
			response = await fetch(url, {
				headers: {
					accept: "text/csv,text/plain;q=0.9,*/*;q=0.2",
					"user-agent": "MerchantOps-CsvConnector/1.0"
				},
				redirect: "manual",
				signal: controller.signal
			});
		} catch (error) {
			throw new PublicCsvError(error instanceof Error && error.name === "AbortError" ? "连接超时，请检查链接后重试。" : "无法连接该数据源。", 502);
		} finally {
			clearTimeout(timer);
		}
		if ([
			301,
			302,
			303,
			307,
			308
		].includes(response.status)) {
			const location = response.headers.get("location");
			if (!location || redirect === MAX_REDIRECTS) throw new PublicCsvError("数据源重定向次数过多。", 502);
			url = validatePublicCsvUrl(new URL(location, url).toString());
			continue;
		}
		if (!response.ok) throw new PublicCsvError(`数据源返回 HTTP ${response.status}。`, 502);
		if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new PublicCsvError("CSV 超过 5MB 限制。", 413);
		const buffer = await response.arrayBuffer();
		if (buffer.byteLength > MAX_BYTES) throw new PublicCsvError("CSV 超过 5MB 限制。", 413);
		return {
			csvText: new TextDecoder("utf-8", { fatal: false }).decode(buffer),
			meta: {
				finalUrl: url.toString(),
				bytes: buffer.byteLength,
				contentType: response.headers.get("content-type") ?? "unknown",
				fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
			}
		};
	}
	throw new PublicCsvError("无法读取该数据源。", 502);
}
//#endregion
//#region server/csvProxyHandler.ts
async function readJson(req) {
	if (req.body && typeof req.body === "object") return req.body;
	const chunks = [];
	for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return {};
	}
}
async function handler(req, res) {
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	if (req.method !== "POST") {
		res.statusCode = 405;
		res.setHeader("Allow", "POST");
		res.end(JSON.stringify({ error: "仅支持 POST 请求。" }));
		return;
	}
	try {
		const result = await fetchPublicCsv((await readJson(req)).url);
		res.statusCode = 200;
		res.end(JSON.stringify(result));
	} catch (error) {
		res.statusCode = error instanceof PublicCsvError ? error.status : 500;
		res.end(JSON.stringify({ error: error instanceof Error ? error.message : "读取在线 CSV 失败。" }));
	}
}
//#endregion
export { handler as default };
