import { z } from "zod";

export const cvSchema = z.object({
	cvUrl: z.string().url(),
});

export const syncUserSchema = z.object({
	role: z.enum(["company", "applicant"]),
	username: z.string().min(1),
	firstName: z.string().nullable().optional(),
	first_name: z.string().nullable().optional(),
	lastName: z.string().nullable().optional(),
	last_name: z.string().nullable().optional(),
	legalName: z.string().nullable().optional(),
	legal_name: z.string().nullable().optional(),
	companyId: z.string().nullable().optional(),
	company_id: z.string().nullable().optional(),
	profile: z.record(z.unknown()).optional(),
});

export const neonAuthUserCreatedSchema = z.object({
	event_id: z.string().uuid(),
	event_type: z.literal("user.created"),
	timestamp: z.string().datetime(),
	context: z.object({
		endpoint_id: z.string().optional(),
		project_name: z.string().optional(),
	}).optional(),
	user: z.object({
		id: z.string().min(1).optional(),
		email: z.string().email().optional(),
		name: z.string().optional(),
		phone_number: z.string().optional(),
		image: z.string().url().nullish(),
		email_verified: z.boolean().optional(),
		phone_number_verified: z.boolean().optional(),
		created_at: z.string().datetime().optional(),
		metadata: z.record(z.unknown()).optional(),
	}).optional(),
	event_data: z.object({
		auth_provider: z.enum(["credential", "google", "github", "vercel"]).optional(),
		ip_address: z.string().optional(),
		user_agent: z.string().optional(),
	}).optional(),
});

export const profileSetupSchema = z.discriminatedUnion("role", [
	z.object({
		role: z.literal("company"),
		legalName: z.string().min(1),
	}),
	z.object({
		role: z.literal("worker"),
		username: z.string().min(1),
		firstName: z.string().min(1),
		lastName: z.string().min(1),
	}),
]);

