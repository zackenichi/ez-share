import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';

export type VaultAccessRequest = { id: string; teamId: string; teamName: string; requesterUid: string; requesterName: string; requesterEmail: string; deviceId: string; expiresAt: string };

export async function GET() {
  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const snapshot = await getAdminDb().collection('vaultAccessRequests').where('approverUids', 'array-contains', session.uid).limit(25).get();
  const requests: VaultAccessRequest[] = snapshot.docs.filter(document => document.data().status === 'pending' && document.data().expiresAt.toMillis() > Date.now()).map(document => { const data = document.data(); return { id: document.id, teamId: data.teamId, teamName: data.teamName, requesterUid: data.requesterUid, requesterName: data.requesterName, requesterEmail: data.requesterEmail, deviceId: data.deviceId, expiresAt: data.expiresAt.toDate().toISOString() }; });
  return NextResponse.json({ requests });
}
