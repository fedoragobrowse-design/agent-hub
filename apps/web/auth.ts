import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({ authorization: { params: { scope: "read:user user:email" } } })],
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "agent-hub-development-secret"),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" }
});
