import { processMatchQueueMessage } from "../workers/ai-match.worker";
import type { Env } from "../bindings";

type QueueBatch = {
	messages: Array<{ body: { applicationId: string; userId: string; jobId: string }; ack: () => void }>;
};

export async function handleMatchQueue(batch: QueueBatch, env: Env) {
	for (const message of batch.messages) {
		await processMatchQueueMessage(env, message.body);
		message.ack();
	}
}
