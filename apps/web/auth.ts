import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const githubAuthenticationAvailable = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET && process.env.AUTH_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: githubAuthenticationAvailable ? [GitHub({ authorization: { params: { scope: "read:user user:email" } } })] : [],
  secret: process.env.AUTH_SECRET ?? "agent-hub-disabled-auth",
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" }
});
