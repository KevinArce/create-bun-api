/** npm package-name rules for new packages, plus a leading-character rule that blocks `-x`, `.`, `..`. */
const VALID = /^[a-z0-9][a-z0-9._-]*$/;
const RESERVED = new Set(["node_modules", "favicon.ico"]);

/** Returns a description of the problem, or null when the name is valid. */
export function validateProjectName(name: string): string | null {
  if (name.length === 0) return "name is empty";
  if (name.length > 214) return "name is longer than 214 characters";
  if (RESERVED.has(name)) return `"${name}" is a reserved name`;
  if (!VALID.test(name)) {
    return "use lowercase letters, digits, '-', '.', or '_', starting with a letter or digit";
  }
  return null;
}

/** Best-effort valid name to offer in a hint. */
export function suggestProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/, "")
    .slice(0, 214);
  return slug || "my-api";
}
