import { Context } from "hono";
import { Env } from "../bindings";
import { createRepositories } from "../repositories";
import { UserService } from "../services/domain/user.service";
import { profileSetupSchema } from "../schemas/users";
import { ok, requireClaims } from "../middleware/auth";

export class UserController {
    static async setupProfile(c: Context<{ Bindings: Env }>) {
        const claims = await requireClaims(c);
        if ("status" in claims) return c.json(claims.body, claims.status);

        const body = profileSetupSchema.parse(await c.req.json());
        const service = new UserService(createRepositories(c.env));
        const userId = claims.sub;

        const existingUser = await service.findUser(userId);

        let userRole: "company" | "applicant";
        let username: string;
        let firstName: string | null = null;
        let lastName: string | null = null;
        let legalName: string | null = null;

        if (body.role === "company") {
            userRole = "company";
            legalName = body.legalName;
            username = existingUser?.username ?? claims.username ?? claims.email ?? claims.sub;
        } else {
            userRole = "applicant";
            username = body.username;
            firstName = body.firstName;
            lastName = body.lastName;
        }

        const updatedUser = await service.upsertUser({
            id: userId,
            role: userRole,
            username,
            firstName,
            lastName,
            legalName,
            companyId: body.role === "company" ? (claims.companyId ?? null) : null,
            profile: {
                ...(existingUser?.profile ?? {}),
                ...claims.raw,
            },
        });

        return c.json(ok(updatedUser));
    }
}
