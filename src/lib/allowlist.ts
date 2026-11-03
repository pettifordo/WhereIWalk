/**
 * Who may sign in. ALLOWED_EMAILS is a comma/space/newline separated list of
 * Google account emails, e.g. "owen@example.com, hilary@example.com".
 * An empty list means nobody can sign in (deny by default).
 * The first email is the owner: data imported before Google login existed is
 * given to them on their first sign-in.
 */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function allowedEmails(): string[] {
  return parseAllowedEmails(process.env.ALLOWED_EMAILS);
}

export function isAllowed(email: string | null | undefined, list = allowedEmails()): boolean {
  return !!email && list.includes(email.trim().toLowerCase());
}

/** The test-only login is never available on Vercel, even if the variable is set. */
export function devLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "1" && !process.env.VERCEL;
}
