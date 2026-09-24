import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';

import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { isActiveMembershipForTeam } from '@/lib/teams/selection';
import { workspaceLandingHref } from '@/lib/teams/routes';

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });

  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { teamId?: unknown } | null;
  const teamId = typeof body?.teamId === 'string' ? body.teamId : '';
  if (!TEAM_ID_PATTERN.test(teamId)) return NextResponse.json({ error: 'A valid workspace is required.' }, { status: 400 });

  const db = getAdminDb();
  const userRef = db.collection('users').doc(session.uid);
  const membershipRef = userRef.collection('teamMemberships').doc(teamId);
  const teamRef = db.collection('teams').doc(teamId);

  try {
    const teamName = await db.runTransaction(async (transaction) => {
      const [user, membership, team] = await Promise.all([
        transaction.get(userRef),
        transaction.get(membershipRef),
        transaction.get(teamRef),
      ]);
      const membershipData = membership.data();
      if (!user.exists) throw new Error('UNAUTHORIZED');
      const authorized = isActiveMembershipForTeam(membership.exists ? {
        teamId: typeof membershipData?.teamId === 'string' ? membershipData.teamId : '',
        status: membershipData?.status === 'active' ? 'active' : 'inactive',
      } : null, teamId);
      if (!authorized) throw new Error('FORBIDDEN');
      if (!team.exists || team.data()?.status === 'archived') throw new Error('NOT_FOUND');

      transaction.update(userRef, { activeTeamId: teamId, updatedAt: FieldValue.serverTimestamp() });
      transaction.update(membershipRef, { lastAccessedAt: FieldValue.serverTimestamp() });
      return typeof team.data()?.name === 'string' ? team.data()!.name : 'Workspace';
    });
    return NextResponse.json({ name: teamName, href: workspaceLandingHref(teamId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
    if (code === 'FORBIDDEN') return NextResponse.json({ error: 'You do not have access to that workspace.' }, { status: 403 });
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'That workspace is no longer available.' }, { status: 404 });
    console.error('Unable to switch workspace:', error);
    return NextResponse.json({ error: 'Unable to switch workspaces.' }, { status: 500 });
  }
}
