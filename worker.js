/*  TraderPro — AI Proxy (Cloudflare Worker)
 *  Maqsad: Gemini API kalitini brauzerdan olib tashlash. Kalit faqat serverda turadi.
 *
 *  O'rnatish:
 *   1) dash.cloudflare.com > Workers & Pages > Create > Worker > shu faylni joylang > Deploy
 *   2) Settings > Variables and Secrets:
 *        GEMINI_KEY       (secret)  — Google AI Studio kaliti
 *        SITE_SECRET      (secret)  — o'zingiz o'ylab topgan uzun parol
 *        ALLOWED_ORIGINS  (text)    — masalan: https://traderpro.pages.dev,http://localhost:8899
 *        TG_TOKEN         (secret)  — ixtiyoriy, Telegram bot tokeni
 *        TG_CHAT          (text)    — ixtiyoriy, Telegram chat id
 *        RATE_MAX         (text)    — ixtiyoriy, daqiqasiga so'rov limiti (default 30)
 *   3) Saytda: Ctrl+K > "AI proxy sozlash" > Worker manzili + SITE_SECRET
 *
 *  Endpointlar:
 *   GET  /health           — tirikligini tekshirish
 *   POST /gemini?model=..  — Gemini generateContent / streamGenerateContent proxy
 *   POST /telegram         — { text } — tokenni yashirgan holda xabar yuborish
 */

const API_HOST = "generativelanguage.googleapis.com";
const TG_HOST = "api.telegram.org";
const ALLOW_HEADERS = "Content-Type, x-goog-api-key, x-tp-secret";
const MAX_BODY = 400000;
const RL = new Map();

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const cors = corsFor(request.headers.get("Origin") || "", env);

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}
		if (url.pathname === "/health" || url.pathname === "/") {
			return json({ ok: true, ts: Date.now(), hasKey: !!env.GEMINI_KEY }, 200, cors);
		}
		if (!secretOk(url, request, env)) {
			return json({ error: { message: "Ruxsat yo'q: maxfiy kalit noto'g'ri" } }, 403, cors);
		}
		if (!rateOk(request, env)) {
			return json({ error: { message: "Juda ko'p so'rov — bir daqiqa kuting" } }, 429, cors);
		}
		if (url.pathname === "/gemini") return gemini(request, url, env, cors);
		if (url.pathname === "/telegram") return telegram(request, env, cors);
		return json({ error: { message: "Bunday manzil yo'q" } }, 404, cors);
	},
};

function corsFor(origin, env) {
	const list = String(env.ALLOWED_ORIGINS || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const allow = list.length === 0 ? "*" : list.indexOf(origin) >= 0 ? origin : list[0];
	return {
		"Access-Control-Allow-Origin": allow,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": ALLOW_HEADERS,
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

function secretOk(url, request, env) {
	const want = String(env.SITE_SECRET || "");
	if (!want) return true; // secret sozlanmagan bo'lsa — tekshirmaymiz
	const got = url.searchParams.get("s") || request.headers.get("x-tp-secret") || "";
	if (got.length !== want.length) return false;
	let diff = 0;
	for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
	return diff === 0;
}

function rateOk(request, env) {
	const max = parseInt(env.RATE_MAX || "30", 10) || 30;
	const ip = request.headers.get("CF-Connecting-IP") || "anon";
	const now = Date.now();
	const slot = RL.get(ip);
	if (!slot || now - slot.t > 60000) {
		RL.set(ip, { t: now, n: 1 });
		if (RL.size > 5000) RL.clear();
		return true;
	}
	slot.n++;
	return slot.n <= max;
}

async function gemini(request, url, env, cors) {
	if (request.method !== "POST") return json({ error: { message: "POST kerak" } }, 405, cors);
	if (!env.GEMINI_KEY) return json({ error: { message: "GEMINI_KEY sozlanmagan" } }, 500, cors);

	const model = String(url.searchParams.get("model") || "gemini-2.5-flash").replace(/[^a-zA-Z0-9.\-_]/g, "");
	const stream = url.searchParams.get("stream") === "1";
	const body = await request.text();
	if (body.length > MAX_BODY) return json({ error: { message: "So'rov juda katta" } }, 413, cors);

	const tail = stream ? ":streamGenerateContent?alt=sse" : ":generateContent";
	const target = "https://" + API_HOST + "/v1beta/models/" + encodeURIComponent(model) + tail;

	let upstream;
	try {
		upstream = await fetch(target, {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
			body,
		});
	} catch (e) {
		return json({ error: { message: "Google API ga ulanib bo'lmadi" } }, 502, cors);
	}

	const headers = new Headers(cors);
	headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
	headers.set("Cache-Control", "no-store");
	return new Response(upstream.body, { status: upstream.status, headers });
}

async function telegram(request, env, cors) {
	if (request.method !== "POST") return json({ error: { message: "POST kerak" } }, 405, cors);
	if (!env.TG_TOKEN || !env.TG_CHAT) return json({ error: { message: "TG_TOKEN / TG_CHAT sozlanmagan" } }, 500, cors);

	let payload = {};
	try {
		payload = await request.json();
	} catch (e) {}
	const text = String((payload && payload.text) || "").slice(0, 3500);
	if (!text) return json({ error: { message: "Matn bo'sh" } }, 400, cors);

	const target = "https://" + TG_HOST + "/bot" + env.TG_TOKEN + "/sendMessage";
	const r = await fetch(target, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: env.TG_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
	});
	const data = await r.json().catch(() => ({}));
	return json(data, r.status, cors);
}

function json(obj, status, cors) {
	const headers = new Headers(cors);
	headers.set("Content-Type", "application/json; charset=utf-8");
	headers.set("Cache-Control", "no-store");
	return new Response(JSON.stringify(obj), { status, headers });
}
