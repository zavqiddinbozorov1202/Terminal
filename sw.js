/*  TraderPro — Service Worker (offline rejim)
 *  index.html bilan bitta papkada turishi shart va HTTPS orqali ochilishi kerak.
 *  Yangi versiya chiqarganda CACHE nomidagi raqamni oshiring.
 */

const CACHE = "traderpro-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

/* Hech qachon keshlanmaydigan manzillar (jonli ma'lumot va AI) */
const NEVER_CACHE = [
	"generativelanguage.googleapis.com",
	"api.telegram.org",
	"api.binance.com",
	"api.frankfurter.dev",
	"firestore.googleapis.com",
	"identitytoolkit.googleapis.com",
	"firebasestorage.googleapis.com",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(SHELL))
			.catch(() => null)
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("message", (event) => {
	if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET") return;

	let url;
	try {
		url = new URL(req.url);
	} catch (e) {
		return;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return;
	if (NEVER_CACHE.some((h) => url.hostname.indexOf(h) >= 0)) return;

	/* Sahifa: avval tarmoq, ishlamasa kesh (yangi versiyani ko'rish uchun) */
	if (req.mode === "navigate") {
		event.respondWith(
			fetch(req)
				.then((res) => {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put("./index.html", copy));
					return res;
				})
				.catch(() => caches.match("./index.html").then((m) => m || caches.match("./")))
		);
		return;
	}

	/* O'z domenimizdagi statik fayllar: avval kesh, keyin tarmoq */
	if (url.origin === self.location.origin) {
		event.respondWith(
			caches.match(req).then((hit) => {
				if (hit) return hit;
				return fetch(req)
					.then((res) => {
						if (res && res.status === 200 && res.type === "basic") {
							const copy = res.clone();
							caches.open(CACHE).then((c) => c.put(req, copy));
						}
						return res;
					})
					.catch(() => hit);
			})
		);
		return;
	}

	/* Tashqi kutubxonalar (CDN, shriftlar): keshdan tez, fonda yangilanadi */
	event.respondWith(
		caches.match(req).then((hit) => {
			const net = fetch(req)
				.then((res) => {
					if (res && (res.status === 200 || res.type === "opaque")) {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(req, copy));
					}
					return res;
				})
				.catch(() => hit);
			return hit || net;
		})
	);
});
