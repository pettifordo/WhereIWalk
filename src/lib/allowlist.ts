/**
 * Admins: ALLOWED_EMAILS is a comma/space/newline separated list of Google
 * account emails, e.g. "owen@example.com, hilary@example.com". Admins can always
 * sign in and can manage the invite list in the app (src/lib/invites.ts).
 * The first email is the owner: data imported before Google login existed is
 * given to them on their first sign-in.
 */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function adminEmails(): string[] {
  return parseAllowedEmails(process.env.ALLOWED_EMAILS);
}

export function isAdminEmail(email: string | null | undefined, list = adminEmails()): boolean {
  return !!email && list.includes(email.trim().toLowerCase());
}

/** The test-only login is never available on Vercel, even if the variable is set. */
export function devLoginEnabled(): boolean {
  return process.env.AUTH_DEV_LOGIN === "1" && !process.env.VERCEL;
}

/** Basic email shape check for the invite form. */
export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
