import type { Env } from "../bindings";
import { createRepositories } from "../repositories";
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

    const repos = createRepositories(env);
    return repos.users.updateCvUrl(
        userId,
        buildCvUrl(env, message.object.key),
    );
}

export async function processMatchQueueMessage(env: Env, message: MatchQueueMessage) {
    const repos = createRepositories(env);
    const [user, job] = await Promise.all([repos.users.getUser(message.userId), repos.jobs.getJob(message.jobId)]);
    if (!user || !job) {
        return null;
    }

    const matchScore = await generateMatchScore(env, { user, job });
    return repos.applications.recordMatchScore(
        message.applicationId,
        message.userId,
        message.jobId,
        matchScore,
    );
}

