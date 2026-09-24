<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project UI conventions

- Build application UI with shadcn/ui components as much as possible. Before creating or styling a control manually, check both the installed components in `src/components/ui` and the official shadcn registry for an appropriate component.
- When an appropriate shadcn component is not installed, add the official component that matches this project's configured Base UI style, then compose or extend it locally. Prefer this over hand-rolled versions of selects, dialogs, dropdowns, tables, form controls, and similar interactive patterns.
- Keep native HTML for semantic document structure and for elements that do not have an appropriate shadcn abstraction. Do not substitute a native interactive control merely to avoid adding an available shadcn component.
- Reuse existing shadcn variants and project UI patterns before introducing one-off styling or new component abstractions.
- Paginate data tables and other potentially unbounded collections by default. Use a sensible fixed page size, show the current page and total item count, provide clear previous and next controls, and perform pagination on the server when the full dataset may be large or expensive to load.
- Every interactive link, button, and button-like control must show a pointer cursor. Disabled controls must show a not-allowed cursor. These defaults are enforced globally in `src/app/globals.css`; preserve them when adding or updating components.
- Use the installed Progress component for route loading and background operations so interactions always provide immediate feedback. Use indeterminate progress when the operation does not expose a meaningful percentage.
- Mount the Sonner `Toaster` once in the root layout. Use Sonner success and error toasts for the outcomes of user-initiated asynchronous actions, especially authentication and database operations; keep inline messages when they provide actionable form context.

## Team and membership invitations

If the application includes organizations, workspaces, projects, teams, households, or any other shared resource with members, preserve these invitation behaviors and security properties:

- Only an authenticated actor with explicit permission to manage the resource's members may create, regenerate, revoke, or otherwise manage invitations.
- Invitations target a normalized lowercase email address and grant an explicit role from the resource's supported role set.
- Reject self-invitations, invalid email addresses or roles, existing members, and duplicate pending invitations for the same resource and recipient.
- When the recipient already has an account, associate the invitation with that account and make it available in the authenticated experience (for example, an invitations inbox or notification).
- When the recipient does not yet have an account, provide a shareable invitation URL suitable for delivery through the application's chosen channel.
- Generate invitation tokens with a cryptographically secure random generator. Store only a one-way token hash, never the plaintext token.
- Give every invitation an explicit expiration and lifecycle state, such as `pending`, `accepted`, `declined`, or `revoked`.
- On sign-in or account creation, claim valid pending invitations by matching the authenticated user's normalized, verified email address.
- Require authentication before acceptance. Account-bound invitations must match the authenticated user ID; link invitations must match both the authenticated user's verified email and the invitation token.
- Compare token hashes using a timing-safe comparison.
- Accept invitations in a database transaction: revalidate the actor, recipient identity, status, expiration, and resource; create the membership idempotently; mark the invitation accepted; and update the user's active resource only when the application has that concept and the change is appropriate.
- Treat all invite IDs, roles, recipient identities, membership state, resource identifiers, and expiration values from the client as untrusted input. Derive or revalidate authoritative values on the server.
- Regenerating an invitation link must rotate its token and renew its expiration. Revocation must prevent all future acceptance attempts.
- Declining an account-bound invitation must verify that the authenticated user is its intended recipient.
- Protect every state-changing endpoint with session authentication and the application's same-origin or CSRF defenses.
- Return deliberate status codes for validation failures, unauthenticated requests, forbidden actions, conflicts, missing invitations, and expired invitations.
- Provide invitation-management UI appropriate to the app for authorized members, including creating, sharing or sending, regenerating, and revoking pending invitations.
- Provide recipient UI for accepting or declining invitations. Unauthenticated link recipients should sign in or register and then return to the original invitation URL.
- Show immediate progress feedback during asynchronous actions, prevent duplicate submissions, use success and error toasts, and refresh or redirect after completion as appropriate.
- Test creation, account claiming, acceptance, decline, revocation, expiration, duplicate prevention, authorization, token mismatch, email mismatch, idempotency, and concurrent acceptance.
