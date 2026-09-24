import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';

import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { validateWorkspaceName, WORKSPACE_NAME_MAX_LENGTH } from '@/lib/teams/validation';
import { workspaceLandingHref } from '@/lib/teams/routes';

export async function GET(request: NextRequest) {
  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const query = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? '';
  if (!query || query.length > WORKSPACE_NAME_MAX_LENGTH) return NextResponse.json({ workspaces: [] });

  try {
    const db = getAdminDb();
    const memberships = await db.collection('users').doc(session.uid).collection('teamMemberships')
      .where('status', '==', 'active').limit(50).get();
    if (memberships.empty) return NextResponse.json({ workspaces: [] });
    const membershipByTeam = new Map(memberships.docs.map((document) => [document.id, document.data()]));
    const teams = await db.getAll(...memberships.docs.map((document) => db.collection('teams').doc(document.id)));
    const workspaces = teams
      .filter((document) => document.exists && document.data()?.status !== 'archived')
      .filter((document) => typeof document.data()?.name === 'string' && document.data()!.name.toLowerCase().includes(query))
      .slice(0, 5)
      .map((document) => ({
        id: document.id,
        name: document.data()!.name as string,
        role: membershipByTeam.get(document.id)?.role === 'owner'
          ? 'owner' as const
          : membershipByTeam.get(document.id)?.role === 'admin' ? 'admin' as const : 'member' as const,
      }));
    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error('Unable to search workspaces:', error);
    return NextResponse.json({ error: 'Unable to search workspaces.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });

  const session = await getSessionUser(true);
  if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = validateWorkspaceName(body?.name);
  if (!name) {
    return NextResponse.json({ error: `Workspace name must be between 1 and ${WORKSPACE_NAME_MAX_LENGTH} characters.` }, { status: 400 });
  }

  const db = getAdminDb();
  const userRef = db.collection('users').doc(session.uid);
  const teamRef = db.collection('teams').doc();
  const membershipRef = userRef.collection('teamMemberships').doc(teamRef.id);

  try {
    await db.runTransaction(async (transaction) => {
      const user = await transaction.get(userRef);
      if (!user.exists) throw new Error('USER_NOT_FOUND');

      transaction.create(teamRef, {
        name,
        status: 'active',
        createdBy: session.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(membershipRef, {
        teamId: teamRef.id,
        userId: session.uid,
        role: 'owner',
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
        lastAccessedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, {
        activeTeamId: teamRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ name, href: workspaceLandingHref(teamRef.id) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      return NextResponse.json({ error: 'Your user profile is unavailable.' }, { status: 409 });
    }
    console.error('Unable to create workspace:', error);
    return NextResponse.json({ error: 'Unable to create the workspace.' }, { status: 500 });
  }
}
