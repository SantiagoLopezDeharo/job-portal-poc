import type { UserRole } from "./auth";

export type UserRecord = {
    id: string;
    role: UserRole;
    username: string;
    firstName: string | null;
    lastName: string | null;
    legalName: string | null;
    companyId: string | null;
    cvUrl: string | null;
    matchScore: number | null;
    profile: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type JobRecord = {
    id: string;
    companyId: string;
    title: string;
    description: string;
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type ApplicationRecord = {
    id: string;
    userId: string;
    jobId: string;
    accepted: boolean | null;
    matchScore: number | null;
    createdAt: string;
    updatedAt: string;
};

export type ApplicationView = ApplicationRecord & {
    jobTitle: string;
    otherEntityName: string;
    jobCompanyId: string;
    applicantName?: string | null;
    applicantSirName?: string | null;
    companyLegalName?: string | null;
};

export type JobInput = {
    title: string;
    description: string;
    payload: Record<string, unknown>;
};

export type AuthUserInput = {
    id: string;
    role: UserRole;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    companyId?: string | null;
    profile?: Record<string, unknown>;
};

export type MatchEvent = {
    applicationId: string;
    userId: string;
    jobId: string;
};

export type MatchScoringPayload = MatchEvent;
