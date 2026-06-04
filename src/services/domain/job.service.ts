import { RepositoryContext } from "../../repositories";
import { JobInput, MatchEvent } from "../../lib/types";

export class JobService {
    constructor(private repos: RepositoryContext) { }

    async createJob(companyId: string, input: JobInput) {
        return this.repos.jobs.createJob(companyId, input);
    }

    async listJobs(companyId?: string, cursor?: string, limit: number = 20) {
        return this.repos.jobs.listJobs(companyId, cursor, limit);
    }

    async applyToJob(userId: string, jobId: string, queue?: Queue<MatchEvent>) {
        const application = await this.repos.applications.createApplication(userId, jobId);

        if (queue) {
            await queue.send({
                applicationId: application.id,
                userId,
                jobId,
            });
        }

        return application;
    }

    async listApplications(role: string, id: string, cursor?: string, limit: number = 20) {
        return role === "company"
            ? this.repos.applications.listByCompany(id, cursor, limit)
            : this.repos.applications.listByApplicant(id, cursor, limit);
    }

    async decideApplication(applicationId: string, companyId: string, accepted: boolean) {
        const application = await this.repos.applications.getApplicationWithOwner(applicationId);
        if (!application || application.jobCompanyId !== companyId) {
            return null;
        }
        return this.repos.applications.updateDecision(applicationId, accepted);
    }
}
