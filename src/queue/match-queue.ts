import type { R2ObjectCreateEvent } from "../workers/ai-match.worker";
import { processCvObjectEventMessage, processMatchQueueMessage } from "../workers/ai-match.worker";
import type { Env } from "../bindings";

type QueueMessageBody =
    | { applicationId: string; userId: string; jobId: string }
    | R2ObjectCreateEvent;

type QueueBatch = {
    messages: Array<{ body: QueueMessageBody; ack: () => void }>;
};

export async function handleMatchQueue(batch: QueueBatch, env: Env) {
    for (const message of batch.messages) {
        if (isR2ObjectEvent(message.body)) {
            await processCvObjectEventMessage(env, message.body);
        } else {
            await processMatchQueueMessage(env, message.body);
        }
        message.ack();
    }
}

function isR2ObjectEvent(body: QueueMessageBody): body is R2ObjectCreateEvent {
    return typeof body === "object" && body !== null && "object" in body && "bucket" in body;
}
