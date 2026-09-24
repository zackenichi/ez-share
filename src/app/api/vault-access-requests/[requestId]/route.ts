import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

export async function PATCH(request: NextRequest, route: RouteContext<'/api/vault-access-requests/[requestId]'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true); if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const parsed = z.object({ action: z.enum(['approve', 'decline']) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A valid action is required.' }, { status: 400 });
  const { requestId } = await route.params; const db = getAdminDb(); const ref = db.collection('vaultAccessRequests').doc(requestId);
  try {
    await db.runTransaction(async transaction => {
      const accessRequest = await transaction.get(ref); const data = accessRequest.data();
      if (!data || data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) throw new Error('UNAVAILABLE');
      if (!Array.isArray(data.approverUids) || !data.approverUids.includes(session.uid)) throw new Error('FORBIDDEN');
      const membership = await transaction.get(db.collection('users').doc(session.uid).collection('teamMemberships').doc(data.teamId));
      if (membership.data()?.status !== 'active' || (membership.data()?.role !== 'owner' && membership.data()?.canShare !== true)) throw new Error('FORBIDDEN');
      if (parsed.data.action === 'approve') {
        const envelope = await transaction.get(db.collection('teams').doc(data.teamId).collection('vaultKeyEnvelopes').doc(`${data.requesterUid}_${data.deviceId}`));
        if (!envelope.exists) throw new Error('KEY_REQUIRED');
      }
      transaction.update(ref, { status: parsed.data.action === 'approve' ? 'approved' : 'declined', respondedByUid: session.uid, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const status = code === 'FORBIDDEN' ? 403 : code === 'KEY_REQUIRED' ? 409 : 404;
    return NextResponse.json({ error: code === 'KEY_REQUIRED' ? 'Encrypt the workspace key for this device before approving.' : code === 'FORBIDDEN' ? 'You cannot approve this request.' : 'This request is unavailable.' }, { status });
  }
}
