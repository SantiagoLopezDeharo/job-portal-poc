import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetMemoryJobPortalStore } from "../../src/lib/poc";
import { processMatchQueueMessage } from "../../src/workers/ai-match.worker";

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
	const response = await SELF.fetch("http://local.test/internal/events/users/sync", {
		method: "POST",
		headers: headersForToken(token),
		body: JSON.stringify(payload),
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

		const cvUpload = await SELF.fetch("http://local.test/internal/events/cv-uploaded", {
			method: "POST",
			headers: headersForToken(applicantToken),
			body: JSON.stringify({ cvUrl: "https://storage.example.com/cv-user-1.pdf" }),
		});
		expect(cvUpload.status).toBe(200);

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
