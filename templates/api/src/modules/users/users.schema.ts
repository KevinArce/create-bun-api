import { t } from "elysia";

export const UserSchema = t.Object({
  id: t.Integer(),
  email: t.String(),
  name: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

export const RegisterBody = t.Object({
  email: t.String({ format: "email", maxLength: 254 }),
  password: t.String({ minLength: 8, maxLength: 256 }),
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export const LoginBody = t.Object({
  email: t.String({ format: "email", maxLength: 254 }),
  password: t.String({ minLength: 1, maxLength: 256 }),
});

export const TokenResponse = t.Object({
  token: t.String(),
  tokenType: t.Literal("Bearer"),
  expiresIn: t.Integer({ description: "Seconds until the token expires" }),
});

export type User = typeof UserSchema.static;
export type RegisterInput = typeof RegisterBody.static;
export type LoginInput = typeof LoginBody.static;
