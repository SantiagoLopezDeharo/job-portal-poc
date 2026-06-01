import type { Env } from "../bindings";
import { createJobPortalStore } from "../lib/poc";
import { buildCvUrl, extractUserIdFromCvObjectKey } from "../services/cv-storage";
import { generateMatchScore } from "../services/match-scoring";

export type MatchQueueMessage = {
    applicationId: string;
    userId: string;
    jobId: string;
};

export type R2ObjectCreateEvent = {
    action: string;
    bucket: string;
    object: {
        key: string;
        size?: number;
        eTag?: string;
    };
};

export async function processCvObjectEventMessage(env: Env, message: R2ObjectCreateEvent) {
    const userId = extractUserIdFromCvObjectKey(message.object.key);
    if (!userId) {
        return null;
    }

    const store = createJobPortalStore(env);
    return store.updateCvUrl({
        userId,
        cvUrl: buildCvUrl(env, message.object.key),
    });
}

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

export async function handleCvObjectBatch(
    batch: { messages: Array<{ body: R2ObjectCreateEvent; ack: () => void }> },
    env: Env,
) {
    for (const message of batch.messages) {
        await processCvObjectEventMessage(env, message.body);
        message.ack();
    }
}
