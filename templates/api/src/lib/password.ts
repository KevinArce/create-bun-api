/**
 * argon2id with Bun's defaults made explicit: 64 MiB memory, 2 iterations.
 * Above OWASP's minimum (19 MiB, 2 iterations). Don't lower these to speed up tests.
 */
export const PASSWORD_HASH_OPTIONS = {
  algorithm: "argon2id",
  memoryCost: 65_536,
  timeCost: 2,
} as const;

export const hashPassword = (password: string) =>
  Bun.password.hash(password, PASSWORD_HASH_OPTIONS);

export const verifyPassword = (password: string, hash: string) =>
  Bun.password.verify(password, hash);

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real check when a user doesn't exist,
 * so response timing doesn't reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-safety");
  await verifyPassword(password, await dummyHash);
  return false;
}
