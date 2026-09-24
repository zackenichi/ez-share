import { createHash, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';

const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

export async function POST(request: NextRequest, route: RouteContext<'/api/public-shares/[token]'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const { token } = await route.params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'This share is unavailable.' }, { status: 404 });
  const parsed = z.object({ keyId: z.string().min(40).max(60) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'The share key is missing.' }, { status: 400 });
  const ref = getAdminDb().collection('vaultShares').doc(createHash('sha256').update(token).digest('hex'));
  try {
    const shared = await getAdminDb().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref); const data = snapshot.data();
      if (!data || data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) throw new Error('UNAVAILABLE');
      const supplied = Buffer.from(parsed.data.keyId); const expected = Buffer.from(String(data.keyId));
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('KEY_MISMATCH');
      transaction.update(ref, { status: 'consumed', consumedAt: FieldValue.serverTimestamp() });
      return { ciphertext: data.ciphertext as string, iv: data.iv as string };
    });
    return NextResponse.json(shared, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: code === 'KEY_MISMATCH' ? 'This share link is incomplete.' : 'This share has expired or was already opened.' }, { status: code === 'KEY_MISMATCH' ? 400 : 410 });
  }
}
