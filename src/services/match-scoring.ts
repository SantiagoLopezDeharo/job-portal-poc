import type { Env } from "../bindings";
import type { JobRecord, UserRecord } from "../lib/types";

export type MatchScoringInput = {
    user: UserRecord;
    job: JobRecord;
};

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct";

function heuristicMatchScore({ user, job }: MatchScoringInput) {
    if (!user.cvUrl) {
        return 1;
    }

    const text = `${user.profile.cv_text ?? ""} ${job.title} ${job.description}`.toLowerCase();
    const tokens = text.split(/[^a-z0-9áéíóúñü]+/gi).filter(Boolean);
    const unique = new Set(tokens);
    return Math.min(100, Math.max(5, unique.size * 3));
}

function extractScoreFromAiResponse(response: unknown) {
    const rawText = typeof response === "string"
        ? response
        : response && typeof response === "object" && "response" in response && typeof (response as { response?: unknown }).response === "string"
            ? (response as { response: string }).response
            : JSON.stringify(response);

    const parsedJson = (() => {
        try {
            return JSON.parse(rawText) as { match_score?: unknown; score?: unknown };
        } catch {
            return null;
        }
    })();

    const candidate = parsedJson?.match_score ?? parsedJson?.score ?? rawText.match(/\b(\d{1,3})\b/)?.[1];
    const score = typeof candidate === "number" ? candidate : Number(candidate);
    if (!Number.isFinite(score)) {
        return null;
    }

    return Math.max(1, Math.min(100, Math.round(score)));
}

export async function generateMatchScore(env: Env, input: MatchScoringInput) {
    if (!input.user.cvUrl) {
        return 1;
    }

    if (env.TEST_MODE === "1" || env.TEST_MODE === "true" || !env.AI) {
        return heuristicMatchScore(input);
    }

    const prompt = [
        "You are a recruiting assistant.",
        "Return only JSON with a match_score integer between 1 and 100 and a short rationale.",
        `Applicant: ${input.user.firstName ?? ""} ${input.user.lastName ?? ""}`.trim(),
        `CV URL: ${input.user.cvUrl}`,
        `Job title: ${input.job.title}`,
        `Job description: ${input.job.description}`,
    ].join("\n");

    try {
        const response = await env.AI.run(MODEL_ID, {
            messages: [{ role: "user", content: prompt }],
        });
        const score = extractScoreFromAiResponse(response);
        return score ?? heuristicMatchScore(input);
    } catch {
        return heuristicMatchScore(input);
    }
}
