import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { devLoginEnabled } from "@/lib/allowlist";
import { currentUserId } from "@/lib/user";

const ERRORS: Record<string, string> = {
  AccessDenied: "That Google account isn't on the WhereIWalk invite list. Ask whoever invited you to add it.",
  Configuration: "Sign-in isn't set up correctly on the server.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUserId()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="page" style={{ maxWidth: 420, textAlign: "center", paddingTop: 48 }}>
      <h1>Sign in to WhereIWalk</h1>
      <p className="muted">See your walks on the map and how much of each National Trail you&apos;ve done.</p>
      {error && <p className="error">{ERRORS[error] ?? "Sign-in failed. Please try again."}</p>}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="primary" type="submit" style={{ padding: "10px 18px", marginTop: 12 }}>
          Sign in with Google
        </button>
      </form>
      <p className="muted small" style={{ marginTop: 24 }}>
        WhereIWalk is invite-only. Only your name and email address are read from Google.
      </p>

      {devLoginEnabled() && (
        <form
          style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 16 }}
          action={async (fd: FormData) => {
            "use server";
            try {
              await signIn("dev", { email: String(fd.get("email") ?? ""), redirectTo: "/" });
            } catch (e) {
              // A rejected login throws; a successful one throws Next's redirect, which must pass through.
              if (e instanceof AuthError) redirect("/signin?error=AccessDenied");
              throw e;
            }
          }}
        >
          <p className="small muted">Test login (local development only)</p>
          <input name="email" type="email" placeholder="email on ALLOWED_EMAILS" required />{" "}
          <button type="submit">Test sign in</button>
        </form>
      )}
    </main>
  );
}
