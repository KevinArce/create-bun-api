import type { Database } from "bun:sqlite";
import type { User } from "./users.schema";

type UserRow = {
  id: number;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: string;
};

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";

/** All SQL for users lives here. Rows never leave this file; hashes leave only via findCredentialsByEmail. */
export function createUsersRepository(db: Database) {
  const insert = db.query<UserRow, { email: string; name: string | null; passwordHash: string }>(
    "INSERT INTO users (email, name, password_hash) VALUES ($email, $name, $passwordHash) RETURNING *",
  );
  const byEmail = db.query<UserRow, { email: string }>("SELECT * FROM users WHERE email = $email");
  const byId = db.query<UserRow, { id: number }>("SELECT * FROM users WHERE id = $id");

  return {
    /** Returns null when the email is already taken. */
    create(input: { email: string; name: string | null; passwordHash: string }): User | null {
      try {
        const row = insert.get(input);
        return row ? toUser(row) : null;
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },
    findCredentialsByEmail(email: string): { user: User; passwordHash: string } | null {
      const row = byEmail.get({ email });
      return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
    },
    findById(id: number): User | null {
      const row = byId.get({ id });
      return row ? toUser(row) : null;
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
