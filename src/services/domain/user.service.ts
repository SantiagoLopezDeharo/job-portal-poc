import { RepositoryContext } from "../../repositories";
import { AuthUserInput } from "../../lib/types";

export class UserService {
    constructor(private repos: RepositoryContext) { }

    async findUser(id: string) {
        return this.repos.users.getUser(id);
    }

    async upsertUser(input: AuthUserInput) {
        return this.repos.users.upsertUser(input);
    }

    async syncAuthUser(claims: any) {
        if (!claims.sub) {
            throw new Error("missing subject");
        }

        return this.repos.users.upsertUser({
            id: claims.sub,
            role: claims.role,
            username: claims.username ?? claims.email ?? claims.sub,
            firstName: claims.firstName ?? null,
            lastName: claims.lastName ?? null,
            legalName: claims.legalName ?? null,
            companyId: claims.companyId ?? null,
            profile: claims.raw,
        });
    }
}
