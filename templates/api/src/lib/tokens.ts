import { jwtVerify, SignJWT } from "jose";

export type TokenClaims = { userId: number };

export type TokenService = {
  readonly ttlSeconds: number;
  sign(claims: TokenClaims): Promise<string>;
  /** Returns null for any invalid, expired, or tampered token. Never throws. */
  verify(token: string): Promise<TokenClaims | null>;
};

export function createTokenService(secret: string, ttlSeconds: number): TokenService {
  const key = new TextEncoder().encode(secret);

  return {
    ttlSeconds,
    async sign({ userId }) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(String(userId))
        .setIssuedAt(now)
        .setExpirationTime(now + ttlSeconds)
        .sign(key);
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        const userId = Number(payload.sub);
        return Number.isSafeInteger(userId) && userId > 0 ? { userId } : null;
      } catch {
        return null;
      }
    },
  };
}
