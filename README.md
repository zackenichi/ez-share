# Next.js Firebase App Template

A reusable Next.js 16 starter with Firebase, Tailwind CSS, and shadcn/ui.

The template includes email/password and Google authentication, persistent server sessions, protected dashboard routes, root-admin provisioning, logout, and account deletion.

It also includes a workspace switcher. Every account receives a private **My workspace**, and the selected workspace is persisted on the server so all server-rendered dashboard data can use the same authorization boundary.

## 1. Install the template

```bash
npm install
cp env.example .env.local
```

Keep `.env.local` open while completing the Firebase steps below.

## 2. Create the Firebase project and Web app

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Create or select a project.
3. From **Project overview**, click the Web icon.
4. Name and register the Web app. Firebase Hosting is optional.
5. Copy the app configuration into these `.env.local` fields:

   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=""
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
   NEXT_PUBLIC_FIREBASE_APP_ID=""
   ```

You can find these values again under **Project settings → General → Your apps**.

## 3. Create the service-account key

Stay in **Project settings**, then:

1. Open **Service accounts → Firebase Admin SDK**.
2. Confirm that the project matches the Web app project.
3. Click **Generate new private key**.
4. Map the downloaded JSON values into `.env.local`:

   | JSON field | Environment variable |
   | --- | --- |
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

   ```env
   FIREBASE_PROJECT_ID="your-project-id"
   FIREBASE_CLIENT_EMAIL="firebase-adminsdk-abcde@your-project-id.iam.gserviceaccount.com"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

`NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `FIREBASE_PROJECT_ID` must match. Keep the private key's `\n` characters when it is stored on one line.

Never commit the downloaded JSON or `.env.local`, expose Admin values through `NEXT_PUBLIC_` variables, or place credentials under `public/`. Store production credentials in your deployment platform's encrypted environment settings.

## 4. Set up Firebase Authentication

Open **Build → Authentication**:

1. Click **Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Enable **Google** and choose a support email.
4. Under **Settings → Authorized domains**, add:
   - `localhost`
   - Your staging hostname
   - Your production hostname

Enter hostnames without `https://` or a path.

No separate Google Client ID environment variable is needed. Firebase manages it for the planned `GoogleAuthProvider` and `signInWithPopup` flow.

Set the initial root administrator in `.env.local`:

```env
ROOT_EMAIL="owner@example.com"
```

`ROOT_EMAIL` is server-only. When authentication is implemented, the server will compare it with the verified Firebase email while creating a user's Firestore profile for the first time. A match receives the `admin` role; every other account receives the `user` role. Role values sent by the browser will never be trusted. Use an email/password or Google account whose verified email exactly matches this value, ignoring capitalization and surrounding spaces.

## 5. Create Cloud Firestore

Open **Build → Firestore Database**:

1. Click **Create database**.
2. Use the default database ID and Standard edition.
3. Select the region closest to the application and its users.
4. Choose **Production mode**.
5. Create the database.
6. Under **Rules**, confirm that access is denied by default:

   ```text
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

Add collection-specific rules as the data model is built. The Admin SDK bypasses Firestore Security Rules, so server operations must perform their own authorization checks.

## 6. Customize the app

Set the application values in `.env.local`:

```env
APP_NAME="AppName"
APP_LOGO_URL="/images/logo.png"
APP_EYEBROW="Your workspace, simplified"
APP_TITLE="Everything you need, all in one place."
APP_DESCRIPTION="A clear, focused home for your team to move work forward and stay in sync."
```

Files under `public` use root-relative paths. For example, `public/images/logo.png` is `/images/logo.png`. The UI uses its default icon when the configured image is missing.

### Replace the favicon

Replace [`src/app/favicon.ico`](src/app/favicon.ico) with your favicon and keep the filename exactly `favicon.ico`. Next.js detects this App Router metadata file automatically and adds it to the document head, so no setting or manual `<link>` tag is required.

The replacement must be a real ICO file, not a PNG renamed with an `.ico` extension. For good browser coverage, export a multi-size ICO containing at least 16×16, 32×32, and 48×48 versions; including larger sizes such as 64×64, 128×128, and 256×256 is also useful.

The file at `public/favicon.ico` is not the active favicon while `src/app/favicon.ico` exists. Use `src/app/favicon.ico` as the single source of truth. After replacing it, restart the development server and hard-refresh the page or clear the browser favicon cache if the previous icon remains visible.

## 7. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other commands:

```bash
npm run lint
npm run build
npm run start
```

## Authentication behavior

Email/password and Google login both produce a Firebase ID token. The server exchanges that token for a persistent, secure session cookie and redirects the user to `/dashboard`.

The cookie name and lifetime are application security policy defined in the authentication code. The cookie uses `httpOnly`, `secure` in production, `sameSite`, and a `maxAge` so closing the browser does not end the session.

Returning users will be handled in two stages:

1. If the server cookie is valid, the server redirects directly to `/dashboard` before rendering the login page.
2. If the server cookie expired but Firebase still has a persistent browser session, the login screen briefly checks Firebase, obtains a fresh ID token, recreates the server cookie, and redirects automatically.

Firebase session cookies have a maximum lifetime of two weeks. Firebase browser persistence allows the app to restore the server session gracefully after that cookie expires. Explicit logout clears both the Firebase browser session and the server cookie.

`src/proxy.ts` performs quick cookie-based redirects for protected routes. It is not the security boundary: protected layouts and endpoints verify the cookie with Firebase Admin before accessing protected data. Invalid sessions return to the login page without creating a redirect loop.

## Workspace data model

Workspaces are stored in `teams/{teamId}`. Memberships are stored below the user at `users/{uid}/teamMemberships/{teamId}` with `teamId`, `userId`, `role` (`owner`, `admin`, or `member`), and `status` (`active` or `inactive`). The user's current choice is stored as `users/{uid}.activeTeamId`.

Application-admin privileges are separate from ordinary workspace membership. Administrators receive explicit access to the shared **Admin** workspace so they can switch to it, but they do not receive access to any other user workspace.

The workspace switch endpoint verifies the Firebase session, same-origin request, active membership, and active workspace in a Firestore transaction before changing `activeTeamId`. Team-scoped server queries should always obtain the current workspace from `getTeamContext(uid)` and must not trust a team identifier supplied by the browser. Existing accounts are migrated once on profile load: an untouched legacy personal workspace is renamed, otherwise a new **My workspace** is created. The `personalWorkspaceProvisioned` marker prevents intentional deletion from recreating it.

The switcher shows at most five recently accessed authorized workspaces. Search filters those locally first, then performs a debounced, membership-scoped server search when there is no recent match. Server search examines at most 50 active memberships and returns at most five results. Successful switches update the membership's `lastAccessedAt` and navigate to the workspace Vault (or User management for the Admin workspace). The workspace layout revalidates the active membership on every direct route access; application administrators do not receive implicit access to other workspaces.

Authenticated users can create a workspace from the switcher's **New workspace** action. Creation is transactional: the server creates the workspace, grants the creator an owner membership, makes it active, and returns its authorized Vault route.

### Vault encryption and persistence

Vault folders, passwords, and secure notes are serialized and encrypted in the browser with a random AES-256-GCM workspace key before upload. The workspace and item identifiers are bound as authenticated additional data. Firestore stores only ciphertext, initialization vectors, crypto/key versions, timestamps, and authorization metadata.

Every workspace has one AES key shared by its active members. That workspace key is itself encrypted with a server-only application master key before it is stored in Firestore. After the server verifies active membership, it releases the workspace key over the authenticated connection and the browser performs item encryption and decryption locally. Existing device-enveloped workspaces automatically adopt their current key after an authorized browser successfully decrypts the existing items. This keeps database-only readers from accessing Vault plaintext while allowing every authorized member to open the shared Vault without device approval or requiring the owner to be online.

Set a separate, stable `VAULT_MASTER_KEY` in every deployed environment. The application falls back to `FIREBASE_PRIVATE_KEY` for backward-compatible local development, but production should not couple Vault encryption to Firebase credential rotation. The current design protects database contents and backups from database-only readers. It does not protect against a compromised application server or deployment, an already-unlocked browser session, or a member retaining content they decrypted before removal. Member removal must be followed by workspace-key rotation and re-encryption before this design can claim cryptographic revocation of future ciphertext.

Members with `canShare` permission can create a one-time public link for an individual Vault item. The browser re-encrypts a separate copy with a random share key; Firestore receives only ciphertext, a share-key fingerprint, a hashed bearer token, and a 24-hour expiration. The decryption key is carried in the URL fragment and is not sent with the page request. The recipient must explicitly reveal the item, and the API atomically marks the share consumed before returning its ciphertext. Link previews therefore do not consume shares. A recipient can still retain content after revealing it.

Workspace owners can manage per-member access from the gear action on each named folder. Folder permissions include View, Edit, and Share, default to the member's workspace permissions, and can only restrict those workspace permissions. Owners always retain full access. Folder names and item contents remain encrypted; opaque folder IDs are stored as authorization metadata. Vault reads, edits, moves, and one-time shares revalidate folder access on the server. As with member removal, restricting a folder prevents future API access but cannot revoke plaintext or ciphertext a member retained while they previously had access.

Workspace owners can rename or delete a workspace from its settings page. Deletion archives the workspace and is rejected unless the owner has another active, accessible workspace to switch to. The system-managed Admin workspace cannot be renamed or deleted.

Users can choose a default workspace in account Settings. The server verifies active membership before saving `users/{uid}.defaultTeamId`; `/dashboard` and normal post-login entry resolve to that workspace. Deleting the default workspace automatically selects a valid fallback.

Non-system workspaces include a Team page. Owners and members with `canShare: true` can invite verified email recipients through seven-day, hashed-token links. Invitees always join as `member`; the invitation copies the independently selected `canEdit` (reserved for Vault authorization) and `canShare` permissions into their membership. Workspace naming and deletion remain owner-only, and the Admin workspace has no Team page.

Administrators can use **Dashboard → User management** to search Firebase accounts, assign admin or user roles, suspend or reactivate access, and permanently delete accounts. Suspended users cannot sign in and see a specific suspension message. The current administrator and configured `ROOT_EMAIL` account are protected from these operations.

## Optional: local Firebase emulators

Set these values in `.env.local`:

```env
NEXT_PUBLIC_USE_FIREBASE_EMULATOR="true"
FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
```

Then install and configure the Firebase CLI:

```bash
npm install --global firebase-tools
firebase login
firebase init emulators
firebase emulators:start
```

Select the Authentication and Firestore emulators. Never set `FIREBASE_AUTH_EMULATOR_HOST` in production.

## Deployment checklist

- Add all `.env.local` values to the deployment environment.
- Keep Firebase Admin credentials server-only.
- Set `ROOT_EMAIL` to the verified account that should receive the initial admin role.
- Under **Firebase Authentication → Settings → Authorized domains**, add every production hostname that serves the login page.
- Under **Firebase Authentication → Sign-in method**, make sure Google is enabled before deploying Google sign-in.
- Keep `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` set to `<project-id>.firebaseapp.com` in normal deployments; the app's production hostname belongs in **Authorized domains**, not in this variable.
- Redeploy Vercel after changing any `NEXT_PUBLIC_*` variable. Next.js embeds these values in the browser bundle at build time.
- Make sure `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` and `FIREBASE_AUTH_EMULATOR_HOST` are disabled or absent in production.
- Run `npm run lint` and `npm run build`.
- Test email/password login, Google login, logout, and protected routes.

## References

- [Firebase Web setup](https://firebase.google.com/docs/web/setup)
- [Firebase Admin setup](https://firebase.google.com/docs/admin/setup)
- [Firebase Authentication](https://firebase.google.com/docs/auth/web/start)
- [Google authentication](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)
- [Cloud Firestore](https://firebase.google.com/docs/firestore/quickstart)
- [Next.js Proxy](https://nextjs.org/docs/app/getting-started/proxy)
