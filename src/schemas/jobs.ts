import { z } from "zod";

export const jobPayloadSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	payload: z.record(z.unknown()).optional().default({}),
});

export const applicationCreateSchema = z.object({
	jobId: z.string().min(1),
});

export const applicationDecisionSchema = z.object({
	accepted: z.boolean(),
});
