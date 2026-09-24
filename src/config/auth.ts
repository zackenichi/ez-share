import 'server-only';

export type AppRole = 'admin' | 'user';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function isRootEmail(email: string | undefined): boolean {
  const rootEmail = process.env.ROOT_EMAIL;
  return Boolean(email && rootEmail && normalizeEmail(email) === normalizeEmail(rootEmail));
}

export function getInitialRole(email: string | undefined): AppRole {
  if (isRootEmail(email)) {
    return 'admin';
  }

  return 'user';
}
