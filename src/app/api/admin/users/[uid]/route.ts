import { NextResponse, type NextRequest } from 'next/server';

import { isRootEmail } from '@/config/auth';
import { getAdminSession } from '@/lib/auth/admin';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { setAdminWorkspaceAccess } from '@/lib/teams/admin-workspace';

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

async function authorize(request: NextRequest, uid: string) {
  if (!sameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }) };
  const admin = await getAdminSession();
  if (!admin) return { error: NextResponse.json({ error: 'Admin access is required.' }, { status: 403 }) };
  const target = await getAdminAuth().getUser(uid).catch(() => null);
  if (!target) return { error: NextResponse.json({ error: 'User not found.' }, { status: 404 }) };
  if (admin.uid === uid || isRootEmail(target.email)) {
    return { error: NextResponse.json({ error: 'This protected account cannot be modified.' }, { status: 403 }) };
  }
  return { admin, target };
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/admin/users/[uid]'>) {
  const { uid } = await context.params;
  const authorization = await authorize(request, uid);
  if ('error' in authorization) return authorization.error;

  const body = (await request.json()) as { role?: unknown; disabled?: unknown };
  if (body.role === 'admin' || body.role === 'user') {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    await db.runTransaction(async (transaction) => {
      const user = await transaction.get(userRef);
      if (!user.exists) throw new Error('USER_PROFILE_NOT_FOUND');
      transaction.set(userRef, { role: body.role }, { merge: true });
      setAdminWorkspaceAccess(transaction, uid, body.role === 'admin');
    });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.disabled === 'boolean') {
    await getAdminAuth().updateUser(uid, { disabled: body.disabled });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'A valid role or disabled state is required.' }, { status: 400 });
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/admin/users/[uid]'>) {
  const { uid } = await context.params;
  const authorization = await authorize(request, uid);
  if ('error' in authorization) return authorization.error;

  await getAdminAuth().deleteUser(uid);
  await getAdminDb().collection('users').doc(uid).delete();
  return NextResponse.json({ ok: true });
}
