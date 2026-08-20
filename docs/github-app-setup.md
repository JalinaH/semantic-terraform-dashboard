# Local GitHub App setup

The dashboard uses one GitHub App for two separate trust boundaries:

1. **User authorization** identifies the dashboard user through the App's OAuth client ID and secret.
2. **Installation authorization** gives the server short-lived access to repositories explicitly granted to an installation.

No personal access token is required. The dashboard never sends the App private key, OAuth tokens, or installation tokens to the browser.

## 1. Create the local App

Open **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**. Use these values for a dashboard running on port 3000:

| GitHub setting | Local value |
| --- | --- |
| GitHub App name | `Semantic Terraform Agent Dev-<unique-suffix>` |
| Homepage URL | `http://localhost:3000` |
| User authorization callback URL | `http://localhost:3000/api/auth/callback/github` |
| Expire user authorization tokens | Enabled (recommended) |
| Request user authorization (OAuth) during installation | **Disabled** |
| Setup URL | `http://localhost:3000/github/callback` |
| Redirect on update | Enabled |
| Webhook URL | `https://<public-development-origin>/api/github/webhooks` |
| Webhook secret | The exact value set as `GITHUB_WEBHOOK_SECRET` |
| Webhook Active | Enabled for Phase 5 |
| Where can this GitHub App be installed? | Any account |

App names are global, so the development name needs a unique suffix.

### Why OAuth-during-installation is disabled

This dashboard deliberately signs the user in first, then starts a separately state-protected installation. GitHub does not use the Setup URL when **Request user authorization (OAuth) during installation** is enabled. Keeping the option disabled preserves the intended flow:

```text
Auth.js callback: /api/auth/callback/github
    establishes user identity

GitHub App setup URL: /github/callback
    returns installation_id + setup_action + signed state
```

The two URLs are not interchangeable. The OAuth callback is handled by Auth.js. The Setup URL is handled by the dashboard's installation-verification route.

`localhost` cannot receive GitHub webhooks. Keep the OAuth callback and Setup URL on localhost for browser testing, but expose the webhook endpoint through a trusted HTTPS development tunnel and enter that public URL in the App registration. In production, all three URLs should use the production HTTPS origin.

## 2. Configure least-privilege permissions

Under **Repository permissions**, set:

| Permission | Access |
| --- | --- |
| Metadata | Read-only (GitHub marks this mandatory) |
| Actions | Read-only |
| Contents | Read-only |
| Pull requests | Read-only |
| Checks | Read-only |

Leave every other repository, organization, and account permission at **No access**. These permissions allow the worker to read workflow jobs/logs, clone an exact revision, resolve PR base/head metadata, and receive check-run audit events. No write permission is enabled in Phase 5.

Subscribe to these repository events:

- **Workflow run** — the only Phase 5 event that can queue execution
- **Pull request**, **Push**, and **Check run** — accepted as bounded audit/context events; they do not start the agent directly

Existing installations must approve newly requested permissions after the App registration changes. Open each installation's GitHub management page and accept the permission update before expecting log collection or checkout to work. Phase 6 PR comments will require a separate, visible pull-request write permission upgrade; do not enable it now.

## 3. Collect the App credentials

After creating the App:

1. Copy the numeric **App ID**.
2. Copy the **Client ID**.
3. Generate one **Client secret** and copy it immediately.
4. Record the App slug from its public URL: `https://github.com/apps/<app-slug>`. Set `GITHUB_APP_SLUG` to only the final `<app-slug>` segment. The dashboard also accepts a copied public-App or personal developer-settings URL and safely extracts that segment.
5. Generate a **private key** and download the PEM file.

Treat the client secret and private key as server-only secrets. Never commit the PEM file.

## 4. Configure the local environment

Copy the template and generate an Auth.js secret:

```bash
cp .env.example .env
openssl rand -base64 32
```

Fill `.env`:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/semantic_terraform_dashboard?schema=public"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AUTH_SECRET="paste-the-generated-value"
AUTH_TRUST_HOST="true"

GITHUB_APP_ID="123456"
GITHUB_APP_CLIENT_ID="Iv1.example"
GITHUB_APP_CLIENT_SECRET="server-only-client-secret"
GITHUB_APP_SLUG="semantic-terraform-agent-dev-example"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET="generate-and-paste-the-same-random-secret-used-by-the-app"
```

The private key may be stored as a quoted, single-line value with literal `\n` sequences; the server converts them to newlines. A normal multiline quoted value is also accepted by common dotenv loaders. Do not prefix any secret with `NEXT_PUBLIC_`.

Generate the webhook secret with a cryptographically secure password generator, keep it server-only, and use the exact same value in GitHub's App webhook settings. Never reuse `AUTH_SECRET`, the client secret, or the private key as the webhook secret.

## 5. Prepare PostgreSQL and start the dashboard

With PostgreSQL available at `DATABASE_URL`:

```bash
pnpm install
pnpm prisma:generate
pnpm prisma migrate dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## 6. Test sign-in and installation

1. Select **Continue with GitHub**.
2. Authorize the development GitHub App for your user identity.
3. Confirm the authenticated header shows your GitHub avatar and login.
4. Open **Repositories** and select **Install GitHub App**.
5. Choose a personal account or an organization where you can install Apps.
6. Choose **Only select repositories**, select a safe test repository, and complete installation.
7. GitHub returns to `/github/callback`; the dashboard verifies the signed state, verifies your user can access the installation, verifies installation metadata using App authentication, and synchronizes repositories.
8. Confirm the selected repository appears under its installation account.
9. Change repository access through **Manage on GitHub**, return to the dashboard, and select **Sync repositories**.
10. Confirm removed grants disappear from the accessible list. Their database records are retained with `accessible = false` for future historical integrity.
11. Open the user menu and select **Sign out**. Confirm `/dashboard` redirects to the landing page.

For hosted automation, also configure a test repository's workflow name and Terraform path patterns, complete its AWS onboarding, start the worker, and follow the end-to-end test in [hosted-agent-execution.md](hosted-agent-execution.md).

## Troubleshooting

- **GitHub sign-in is not configured:** one or more Auth.js/database values are missing. Compare `.env` with `.env.example` and restart the dev server.
- **Invalid installation callback:** restart the installation from the dashboard. Installation state expires after ten minutes and is bound to the signed-in user plus an HTTP-only correlation cookie.
- **Installation not accessible:** sign in with a GitHub user that can see the installation, or install the App on an account available to that user.
- **Rate limited:** wait for the GitHub API rate limit to reset, then run manual sync again.
- **Private key parsing failed:** ensure the full PEM header/footer is present and newlines are real line breaks or literal `\n` sequences.
- **Organization not listed:** an organization owner may restrict GitHub App installation. Ask an owner to approve or install the App.
- **Webhook delivery is 401:** the dashboard and App webhook secrets differ, or a proxy altered the request body. GitHub must sign the exact bytes the route receives.
- **Run is queued but log collection fails:** approve the App's Actions read permission update and confirm the workflow/job log is still retained.
- **Checkout fails:** approve Contents read access and confirm the repository is still granted to the installation.

For a remote development URL, replace both localhost callback URLs with the exact HTTPS origin. Do not add wildcard callback or Setup URLs.
