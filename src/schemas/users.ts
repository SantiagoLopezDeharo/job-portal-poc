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
