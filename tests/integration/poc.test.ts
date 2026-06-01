import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetMemoryJobPortalStore } from "../../src/lib/poc";
import { processCvObjectEventMessage, processMatchQueueMessage } from "../../src/workers/ai-match.worker";

function base64UrlEncode(value: string) {
	return Buffer.from(value)
		.toString("base64")
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");
}

function makeToken(payload: Record<string, unknown>) {
	return [
		base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" })),
		base64UrlEncode(JSON.stringify(payload)),
		"signature",
	].join(".");
}

function headersForToken(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};
}

async function syncUser(payload: Record<string, unknown>) {
	const token = makeToken(payload);
	const sub = String(payload.sub ?? "");
	const role = payload.role === "company" ? "company" : "applicant";
	const email = typeof payload.email === "string" ? payload.email : `${sub}@example.com`;
	const firstName = typeof payload.first_name === "string" ? payload.first_name : undefined;
	const lastName = typeof payload.last_name === "string" ? payload.last_name : undefined;
	const fullName = [firstName, lastName].filter(Boolean).join(" ") || (typeof payload.username === "string" ? payload.username : sub);

	const response = await SELF.fetch("http://local.test/internal/events/users/sync", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-neon-test-bypass": "1",
		},
		body: JSON.stringify({
				event_id: crypto.randomUUID(),
				event_type: "user.created",
			timestamp: new Date().toISOString(),
				context: {
					endpoint_id: "ep-test-webhook-endpoint",
					project_name: "Job Portal PoC",
				},
				user: {
				id: sub,
				email,
				name: fullName,
				created_at: new Date().toISOString(),
				metadata: {
					role,
					username: typeof payload.username === "string" ? payload.username : undefined,
					first_name: firstName,
					last_name: lastName,
					legal_name: typeof payload.legal_name === "string" ? payload.legal_name : undefined,
					company_id: typeof payload.company_id === "string" ? payload.company_id : undefined,
				},
			},
				event_data: {
					auth_provider: "credential",
					ip_address: "127.0.0.1",
					user_agent: "vitest",
				},
		}),
	});

	expect(response.status).toBe(201);
	return token;
}

async function createJob(companyToken: string, job: Record<string, unknown>) {
	const response = await SELF.fetch("http://local.test/jobs", {
		method: "POST",
		headers: headersForToken(companyToken),
		body: JSON.stringify(job),
	});

	expect(response.status).toBe(201);
	const body = await response.json<{ success: boolean; result: { id: string } }>();
	return body.result.id;
}

async function uploadCv(applicantToken: string, filename = "resume.pdf") {
	const formData = new FormData();
	formData.set("file", new File(["frontend react typescript"], filename, { type: "application/pdf" }));

	const response = await SELF.fetch("http://local.test/cv", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${applicantToken}`,
		},
		body: formData,
	});

	expect(response.status).toBe(202);
	const body = await response.json<{ success: boolean; result: { key: string; queued: boolean } }>();
	expect(body.result.queued).toBe(true);
	return body.result.key;
}

describe("job portal PoC", () => {
	beforeEach(() => {
		resetMemoryJobPortalStore();
	});

	it("creates jobs, applications, and match scores for an applicant with a CV", async () => {
		const companyToken = await syncUser({
			sub: "company-1",
			role: "company",
			username: "acme",
			legal_name: "ACME SRL",
			company_id: "company-1",
		});
		const applicantToken = await syncUser({
			sub: "user-1",
			role: "applicant",
			username: "jdoe",
			first_name: "John",
			last_name: "Doe",
		});

		const jobId = await createJob(companyToken, {
			title: "Frontend Engineer",
			description: "React and TypeScript role",
			payload: { seniority: "mid" },
		});

		const cvKey = await uploadCv(applicantToken);
		await processCvObjectEventMessage(env, {
			action: "PutObject",
			bucket: "job-portal-cv-bucket",
			object: {
				key: cvKey,
			},
		});

		const applyResponse = await SELF.fetch("http://local.test/jobs/applications", {
			method: "POST",
			headers: headersForToken(applicantToken),
			body: JSON.stringify({ jobId }),
		});

		expect(applyResponse.status).toBe(201);
		const applyBody = await applyResponse.json<any>();
		expect(applyBody.success).toBe(true);
		expect(applyBody.result.application).toEqual(
			expect.objectContaining({
				jobId,
				userId: "user-1",
				matchScore: null,
			}),
		);
		expect(applyBody.result.queued).toBe(true);

		await processMatchQueueMessage(env, {
			applicationId: applyBody.result.application.id,
			userId: "user-1",
			jobId,
		});

		const cvResponse = await SELF.fetch(`http://local.test/cv/${cvKey}`);
		expect(cvResponse.status).toBe(200);
		expect(await cvResponse.text()).toContain("frontend react typescript");

		const refreshedApplications = await SELF.fetch("http://local.test/applications", {
			headers: headersForToken(applicantToken),
		});
		const refreshedBody = await refreshedApplications.json<any>();
		expect(refreshedBody.result[0].matchScore).toBeGreaterThan(1);

		const applicantApplications = await SELF.fetch("http://local.test/applications", {
			headers: headersForToken(applicantToken),
		});
		const applicantBody = await applicantApplications.json<any>();
		expect(applicantBody.result[0]).toEqual(
			expect.objectContaining({
				jobTitle: "Frontend Engineer",
				otherEntityName: "ACME SRL",
			}),
		);

		const companyApplications = await SELF.fetch("http://local.test/applications", {
			headers: headersForToken(companyToken),
		});
		const companyBody = await companyApplications.json<any>();
		expect(companyBody.result[0]).toEqual(
			expect.objectContaining({
				jobTitle: "Frontend Engineer",
				otherEntityName: "John Doe",
			}),
		);
	});

	it("lets a company accept its own application but not another company's application", async () => {
		const companyToken = await syncUser({
			sub: "company-a",
			role: "company",
			username: "alpha",
			legal_name: "Alpha LLC",
			company_id: "company-a",
		});
		const otherCompanyToken = await syncUser({
			sub: "company-b",
			role: "company",
			username: "beta",
			legal_name: "Beta Inc",
			company_id: "company-b",
		});
		const applicantToken = await syncUser({
			sub: "user-2",
			role: "applicant",
			username: "alice",
			first_name: "Alice",
			last_name: "Smith",
		});

		const jobId = await createJob(companyToken, {
			title: "Backend Engineer",
			description: "Node.js and SQL role",
			payload: {},
		});
		const createApplication = await SELF.fetch("http://local.test/jobs/applications", {
			method: "POST",
			headers: headersForToken(applicantToken),
			body: JSON.stringify({ jobId }),
		});
		const createBody = await createApplication.json<any>();
		const applicationId = createBody.result.application.id;

		const forbiddenUpdate = await SELF.fetch(`http://local.test/jobs/applications/${applicationId}`, {
			method: "PUT",
			headers: headersForToken(otherCompanyToken),
			body: JSON.stringify({ accepted: true }),
		});
		expect(forbiddenUpdate.status).toBe(404);

		const acceptResponse = await SELF.fetch(`http://local.test/jobs/applications/${applicationId}`, {
			method: "PUT",
			headers: headersForToken(companyToken),
			body: JSON.stringify({ accepted: true }),
		});
		expect(acceptResponse.status).toBe(200);
		const acceptBody = await acceptResponse.json<any>();
		expect(acceptBody.result.accepted).toBe(true);
	});

	it("returns all jobs to unauthenticated callers and company jobs to company users", async () => {
		const companyToken = await syncUser({
			sub: "company-c",
			role: "company",
			username: "gamma",
			legal_name: "Gamma Corp",
			company_id: "company-c",
		});
		const otherCompanyToken = await syncUser({
			sub: "company-d",
			role: "company",
			username: "delta",
			legal_name: "Delta Ltd",
			company_id: "company-d",
		});

		await createJob(companyToken, {
			title: "Data Engineer",
			description: "ETL pipelines",
			payload: {},
		});
		await createJob(otherCompanyToken, {
			title: "QA Analyst",
			description: "Automation focus",
			payload: {},
		});

		const anonymousJobs = await SELF.fetch("http://local.test/jobs");
		const anonymousBody = await anonymousJobs.json<any>();
		expect(anonymousBody.result).toHaveLength(2);

		const companyJobs = await SELF.fetch("http://local.test/jobs", {
			headers: headersForToken(companyToken),
		});
		const companyBody = await companyJobs.json<any>();
		expect(companyBody.result).toHaveLength(1);
		expect(companyBody.result[0].companyId).toBe("company-c");
	});
});
