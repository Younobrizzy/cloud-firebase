# JSON Mail

JSON Mail is a Cloudflare Pages email API that uses Firebase Authentication, Firestore, and an SMTP account supplied by each user.

## Pages

- `/` — sign in or create an account
- `/onboarding/` — shown only when the signed-in user has no profile
- `/dashboard/` — SMTP and API settings

Every signed-in user uses `/dashboard/`. There is no username-based dashboard route and no `_redirects` file is required.

## User profiles

Each user is stored in `users/{userId}`:

```text
userId
firstName
lastName
email
role
```

New accounts are assigned the `subscriber` role automatically. The role is set by the server and is not provided by the signup form.

## SMTP

Each user has one document at `smtpConfigs/{userId}`.

Each API has its own SMTP settings, with an optional custom sender and encrypted password storage.

The dashboard **Custom From email** is optional. When a value is provided, saving the SMTP configuration performs a real SMTP compatibility check: the app authenticates with the supplied SMTP credentials and sends a `MAIL FROM` command using the custom address without sending an email. The custom address is saved only when the SMTP server accepts it. If the server rejects it, the SMTP configuration is not updated with that custom address and the error is shown in the dashboard.

When a saved custom From email is present, outgoing messages use it for both the SMTP envelope sender (`MAIL FROM`) and the message `From:` header. If **Custom From email** is blank, the SMTP username is used as the sender. Some mail providers can still rewrite the visible sender after accepting the message; that behavior is controlled by the provider, not by this application.

The dashboard **From name** is optional. A JSON `name` value overrides it for that request.

## API key

Each user has one document at `userApiKeys/{userId}`. There is no `apiKeys` collection.

The document contains the API key, enabled state, usage count, and `lastUsedAt` timestamp.

Endpoint:

```text
POST /api/send/{key}
```

Successful requests return only:

```json
{
  "success": true,
  "message": "Email sent successfully."
}
```

## JSON body requirements

Two fields are required for every request:

- `subject` — required and must be a non-empty string
- `message` **or** `html` — at least one is required and must contain a non-empty string

`message` and `html` can be used in any of these ways:

1. `message` only
2. `html` only
3. both `message` and `html`

A request that contains neither a non-empty `message` nor a non-empty `html` field is rejected.

A request with an empty or missing `subject` is rejected.

Optional fields:

- `to` — sends the main email to another recipient; the authenticated SMTP user receives a small delivery notice
- `name` — overrides the SMTP From name
- `email` — used as Reply-To
- `from` — not accepted; the sender is controlled by the saved SMTP configuration
- `cc`
- `bcc`

The configured Custom From email is used as the sender when present and accepted by the SMTP server; otherwise the authenticated SMTP username is the sender. Without `to`, the authenticated SMTP username is also the recipient. When `to` is used, the main email goes to the requested recipient and the authenticated user receives a notice. If the recipient exists in `users`, the notice includes their first and last name plus email; otherwise it includes only the email.

### Message-only example

```json
{
  "to": "recipient@example.com",
  "subject": "Hello",
  "message": "Welcome to our app."
}
```

### HTML-only example

```json
{
  "to": "recipient@example.com",
  "subject": "Welcome",
  "html": "<h1>Welcome</h1><p>Welcome to our app.</p>"
}
```

### Message + HTML example

```json
{
  "to": "recipient@example.com",
  "email": "reply@example.com",
  "name": "John Doe",
  "subject": "Hello",
  "message": "Welcome to our app.",
  "html": "<h1>Welcome</h1><p>Welcome to our app.</p>"
}
```

### Validation errors

Missing or empty `subject` returns a `400` response:

```json
{
  "error": "A non-empty 'subject' is required."
}
```

Missing or empty `message` **and** `html` returns a `400` response:

```json
{
  "error": "A non-empty 'message' or 'html' is required."
}
```

## Cloudflare variables

Public Firebase configuration returned by `/api/config`:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

Server secret:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
SMTP_ENCRYPTION_KEY
```

Keep secrets in Cloudflare Variables and Secrets. Never commit real credentials.

For local Pages development, use `.dev.vars` and keep it out of Git.

## Structure

```text
/
├── index.html
├── onboarding/index.html
├── dashboard/index.html
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── firebase.js
│       └── firebase-config.js
├── functions/
│   ├── api/config.js
│   ├── api/key.js
│   ├── api/send/[key].js
│   ├── api/smtp.js
│   ├── api/user.js
│   └── lib/
│       ├── auth.js
│       ├── crypto.js
│       ├── firestore.js
│       └── smtp.js
├── wrangler.toml
└── .gitignore
```
