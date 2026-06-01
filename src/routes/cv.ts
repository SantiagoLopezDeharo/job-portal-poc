import type { Hono } from "hono";
import type { Env } from "../bindings";
import { buildCvObjectKey } from "../services/cv-storage";
import { ok, requireClaims } from "../middleware/auth";

export function registerCvRoutes(app: Hono<{ Bindings: Env }>) {
	app.post("/cv", async (c) => {
		const claims = await requireClaims(c, ["applicant"]);
		if ("status" in claims) {
			return c.json(claims.body, claims.status);
		}

		if (!c.env.CV_BUCKET) {
			return c.json({ success: false, errors: [{ code: 5030, message: "CV bucket not configured" }] }, 503);
		}

		const formData = await c.req.formData();
		const file = formData.get("file");
		if (!(file instanceof File)) {
			return c.json({ success: false, errors: [{ code: 4000, message: "Missing file field" }] }, 400);
		}

		const key = buildCvObjectKey(claims.sub, file.name || "cv.pdf");
		await c.env.CV_BUCKET.put(key, file, {
			httpMetadata: {
				contentType: file.type || "application/pdf",
			},
			customMetadata: {
				userId: claims.sub,
			},
		});

		return c.json(ok({ key, queued: true }), 202);
	});

	app.get("/cv/*", async (c) => {
		if (!c.env.CV_BUCKET) {
			return c.json({ success: false, errors: [{ code: 5030, message: "CV bucket not configured" }] }, 503);
		}

		const key = new URL(c.req.url).pathname.slice("/cv/".length);
		const object = await c.env.CV_BUCKET.get(key);
		if (!object) {
			return c.json({ success: false, errors: [{ code: 4040, message: "CV not found" }] }, 404);
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("Content-Length", String(object.size));
		return new Response(object.body, { headers });
	});
}
