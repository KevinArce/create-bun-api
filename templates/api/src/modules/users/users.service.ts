import { conflict, notFound, unauthorized } from "../../lib/errors";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../../lib/password";
import type { TokenService } from "../../lib/tokens";
import type { UsersRepository } from "./users.repository";
import type { LoginInput, RegisterInput, User } from "./users.schema";

/** Business rules for accounts. Throws HttpError; knows nothing about HTTP routing. */
export function createUsersService(repo: UsersRepository, tokens: TokenService) {
  return {
    async register(input: RegisterInput): Promise<User> {
      const passwordHash = await hashPassword(input.password);
      const user = repo.create({ email: input.email, name: input.name ?? null, passwordHash });
      if (!user) throw conflict("An account with this email already exists");
      return user;
    },

    async login(input: LoginInput) {
      const found = repo.findCredentialsByEmail(input.email);
      const valid = found
        ? await verifyPassword(input.password, found.passwordHash)
        : await verifyAgainstDummy(input.password);
      // Same message for unknown email and wrong password: don't reveal which accounts exist.
      if (!found || !valid) throw unauthorized("Invalid email or password");

      const token = await tokens.sign({ userId: found.user.id });
      return { token, tokenType: "Bearer" as const, expiresIn: tokens.ttlSeconds };
    },

    getById(id: number): User {
      const user = repo.findById(id);
      if (!user) throw notFound("User not found");
      return user;
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
