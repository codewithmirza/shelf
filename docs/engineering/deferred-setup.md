# Setup that a person must do

> **What this is.** The accounts, keys and settings that only a founder can create, with what each one blocks and how to check it.
>
> **Why it comes here.** An agent cannot sign up for PayPal or hold a secret it should not see. A flow test that fails for a missing secret is not a code defect.
>
> **Shelf example.** Until S-03 is done, task T-04 cannot run SPK-04, because there is no AI Gateway with the Vertex key.
>
> **What it produces.** S-01 to S-09. Secrets go in with `wrangler secret put`; never paste them into a chat, a commit or an issue.

| ID | Step | Who | Blocks | Check |
| --- | --- | --- | --- | --- |
| S-01 | Create the empty private repository `codewithmirza/shelf`. | Mirza | Push | The repository exists with no files. |
| S-02 | Cloudflare: Workers Paid plan on the account; create D1 `shelf`, R2 `shelf-photos`, Queue `extraction` and `extraction-failed`. | Mirza | T-01, T-02, T-16 | `wrangler d1 list`, `wrangler r2 bucket list`, `wrangler queues list`. |
| S-03 | GCP: enable Vertex AI in the project with credits; create a service account with role "Vertex AI User"; create a JSON key. Cloudflare AI Gateway `shelf`: add the Google Vertex AI provider with that key; create a gateway token. | Mirza | T-04 | A `curl` through the gateway returns a `gemini-3.8-flash` answer. |
| S-04 | PayPal developer: create a sandbox REST app (US). Record the client ID and secret. | Mirza | T-03 | `POST /v1/oauth2/token` returns a token. |
| S-05 | PayPal sandbox accounts (all US): 1 platform business account (owns the app), 2 seller business accounts (maya-mugs, river-prints), 1 personal buyer account for the Try page. | Mirza | T-03, T-06, T-23 | Each logs in at sandbox.paypal.com. |
| S-06 | On the sandbox app: turn on Log in with PayPal with the return URL `{PUBLIC_ORIGIN}/api/auth/paypal/return` and the email scope. | Mirza | T-07 | SPK-06 passes. |
| S-07 | On the sandbox app: add a webhook to `{PUBLIC_ORIGIN}/api/webhooks/paypal` for the 5 events in Gate 5. Record the webhook ID. | Mirza | T-11 | The webhook simulator reaches the route. |
| S-08 | Claude: add `{PUBLIC_ORIGIN}/mcp` as a custom connector. ChatGPT: turn on developer mode and add the same URL. | Mirza | T-05, video | The tools list shows in both. |
| S-10 | Set `TOKEN_SECRET` on the Worker: 32 or more random characters (`openssl rand -base64 48`). | Mirza | T-10 | The Pay page opens from a start_checkout link. |
| S-09 | Generate VAPID keys for Web Push. | Agent may generate; Mirza stores them | T-20 | Keys set as secrets. |

## The principle to remember

Write down every step only a person can do, so no one mistakes a missing key for a bug.
