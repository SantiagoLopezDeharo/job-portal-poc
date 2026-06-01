import type { Env } from "../bindings";
import { createJobPortalStore } from "../lib/poc";
import { generateMatchScore } from "../services/match-scoring";

export type MatchQueueMessage = {
	applicationId: string;
	userId: string;
	jobId: string;
};

export async function processMatchQueueMessage(env: Env, message: MatchQueueMessage) {
	const store = createJobPortalStore(env);
	const [user, job] = await Promise.all([store.getUser(message.userId), store.getJob(message.jobId)]);
	if (!user || !job) {
		return null;
	}

	const matchScore = await generateMatchScore(env, { user, job });
	return store.recordMatchScore({
		applicationId: message.applicationId,
		userId: message.userId,
		jobId: message.jobId,
		matchScore,
	});
}

export async function handleMatchScoreBatch(
	batch: { messages: Array<{ body: MatchQueueMessage; ack: () => void }> },
	env: Env,
) {
	for (const message of batch.messages) {
		await processMatchQueueMessage(env, message.body);
		message.ack();
	}
}
