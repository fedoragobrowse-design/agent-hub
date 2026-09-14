/**
 * GitHub OAuth integration boundary. Configure this in the web application with
 * AUTH_GITHUB_ID/AUTH_GITHUB_SECRET. Repository access is a separately stored
 * connection and must request only the scopes required for repositories chosen.
 */
export const githubOAuth = {
  provider: "github",
  profileScopes: ["read:user", "user:email"],
  // A Hub sign-in never gains repository access. A future repository connector
  // must use a user-approved, repository-scoped GitHub App installation.
  repositoryScope: null,
  repositoryGrant: "explicit-github-app-installation",
  authorizationParams: { allow_signup: "true" }
} as const;
