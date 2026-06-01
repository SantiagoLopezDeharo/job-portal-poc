import { createJobPortalStore, processQueuedMatchJob } from "../lib/poc";
import type { Env } from "../bindings";

type QueueBatch = {
	messages: Array<{ body: { applicationId: string; userId: string; jobId: string }; ack: () => void }>;
};

export async function handleMatchQueue(batch: QueueBatch, env: Env) {
	const store = createJobPortalStore(env);
	for (const message of batch.messages) {
		await processQueuedMatchJob(store, message.body);
		message.ack();
	}
}
