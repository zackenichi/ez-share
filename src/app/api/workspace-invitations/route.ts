import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/firebase/session';
import { getPendingWorkspaceInvitations } from '@/lib/teams/workspace-invitations';

export async function GET() {
  const session = await getSessionUser(true);
  if (!session?.email || !session.email_verified) return NextResponse.json({ error: 'A verified account is required.' }, { status: 401 });
  return NextResponse.json({ invitations: await getPendingWorkspaceInvitations(session.uid) });
}
