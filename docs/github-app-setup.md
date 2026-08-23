# TerraFix GitHub App setup

One GitHub App provides two separate trust boundaries: GitHub OAuth identifies
the dashboard user, while App installations grant short-lived access to chosen
repositories. TerraFix requests no personal access token.

## URLs

For `https://<terrafix-deployment>` configure:

| GitHub App setting | Production value |
| --- | --- |
| Homepage URL | `https://<terrafix-deployment>/` |
| User authorization callback URL | `https://<terrafix-deployment>/api/auth/callback/github` |
| Setup URL | `https://<terrafix-deployment>/github/callback` |
| Webhook URL | `https://<terrafix-deployment>/api/github/webhooks` |
| Request user authorization during installation | Disabled |
| Redirect on update | Enabled |
| Webhook active | Enabled |

TerraFix signs the user in first, then starts a state- and cookie-bound
installation. Enabling GitHub's OAuth-during-installation option bypasses the
expected Setup URL and breaks that intentional flow.

For local UI/auth setup, replace the origin with `http://localhost:3000` for the
homepage, OAuth callback, and Setup URL. GitHub cannot deliver webhooks to
localhost; use a trusted HTTPS tunnel only for `/api/github/webhooks`.

## Least-privilege repository permissions

| Capability | GitHub App permission | Access |
| --- | --- | --- |
| Installation/repository discovery | Metadata | Read (mandatory) |
| Workflow runs, jobs, and retained logs | Actions | Read |
| Exact revision clone; confirmed verified-patch commit | Contents | Write |
| PR metadata and changed files | Pull requests | Read (included by write) |
| Create/update one diagnosis comment | Pull requests | Write |

Leave every other repository, organization, and account permission at **No
access**. TerraFix does not need Workflows write, Administration, Deployments,
Environments, Secrets, Members, Checks, or branch-protection bypass access.
The code does not call the Checks API.

Existing installations must approve Pull requests: Write and the Phase 11
Contents: Write upgrade. Until then, diagnosis can complete, but Apply to PR is
blocked with `github_contents_write_required`. Approve the change on GitHub,
then select **Sync repositories** in TerraFix.

## Events

Subscribe only to:

- **Workflow run**

The handler ignores every unsupported event and only a `workflow_run` with
`action=completed` and `conclusion=failure` can pass dispatch. PR/push origin,
PR references, base/head SHAs, and the source event are already present or
resolved from the workflow-run payload. Direct Pull request, Push, Check run,
Installation, and Installation repositories subscriptions are not required by
the current implementation. Installation setup/update returns through the Setup
URL, and repository changes are synchronized on return or through the explicit
authenticated Sync action.

## Credentials

Record the App ID, Client ID, one Client secret, App slug, private key PEM, and
a separately generated webhook secret. Configure the variables listed in
[deployment.md](deployment.md). The PEM may be stored on one line using literal
`\n`; TerraFix restores line breaks server-side.

Never reuse `AUTH_SECRET`, the OAuth client secret, private key, or webhook
secret for another purpose. None may use a `NEXT_PUBLIC_` prefix.

## Installation flow validation

1. Sign in with GitHub.
2. Select **Install GitHub App** from Repositories.
3. Choose a personal/organization account and grant a dedicated repository.
4. GitHub returns `installation_id`, `setup_action`, and the signed state to
   `/github/callback`.
5. TerraFix verifies the state/correlation cookie, verifies the user can access
   that installation, cross-checks installation identity with App
   authentication, persists the link, and synchronizes repositories.
6. Confirm the repository appears without a manual refresh.
7. Change grants on GitHub, return, select Sync, and confirm removed grants are
   retained as inaccessible history rather than deleted.

If installation approval is pending or suspended, TerraFix preserves setup but
does not mark the repository ready.

## Webhook behavior

The route reads at most 2 MiB of raw bytes, verifies
`X-Hub-Signature-256` before JSON parsing, validates delivery/event headers, and
reserves the unique delivery ID in PostgreSQL. It logs only delivery/event,
repository ID, outcome, AgentRun ID or skip reason, status, and duration. It
never logs the body, signature, tokens, source, or workflow logs.

Valid duplicates return success without creating another run. Unsupported
events return a bounded ignored result. Database/processing failures return a
safe 500 and mark a reserved delivery failed so a GitHub redelivery can be
reprocessed once.

## Troubleshooting

- **Sign-in not configured:** verify dashboard runtime variables and restart.
- **Invalid callback:** restart installation; signed state expires after ten
  minutes and is bound to the current user/cookie.
- **Installation inaccessible:** sign in as a user who can see that App
  installation or request organization approval.
- **Webhook 401:** the webhook secrets differ or a proxy altered raw bytes.
- **Run log unavailable:** confirm Actions read and workflow log retention.
- **Checkout failed:** confirm the Contents grant and repository access.
- **Publication permission missing:** approve Pull requests write and sync.
- **Apply permission missing:** approve Contents write and sync. This permission
  is used only after explicit approval of an already verified patch.
