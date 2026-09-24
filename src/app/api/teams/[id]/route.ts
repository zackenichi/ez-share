import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { isSameOrigin } from '@/lib/auth/request';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';
import { validateWorkspaceName, WORKSPACE_NAME_MAX_LENGTH } from '@/lib/teams/validation';
import { workspaceLandingHref } from '@/lib/teams/routes';

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;

async function authorize(request: NextRequest, id: string) {
  if (!isSameOrigin(request)) return { error: NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }) };
  const session = await getSessionUser(true);
  if (!session) return { error: NextResponse.json({ error: 'Authentication is required.' }, { status: 401 }) };
  if (!VALID_ID.test(id) || id === ADMIN_TEAM_ID) return { error: NextResponse.json({ error: 'This workspace cannot be changed.' }, { status: 403 }) };
  return { session };
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/teams/[id]'>) {
  const { id } = await context.params;
  const authorization = await authorize(request, id);
  if ('error' in authorization) return authorization.error;
  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = validateWorkspaceName(body?.name);
  if (!name) return NextResponse.json({ error: `Workspace name must be between 1 and ${WORKSPACE_NAME_MAX_LENGTH} characters.` }, { status: 400 });
  const db = getAdminDb();
  const membershipRef = db.collection('users').doc(authorization.session.uid).collection('teamMemberships').doc(id);
  const teamRef = db.collection('teams').doc(id);
  try {
    await db.runTransaction(async (transaction) => {
      const [membership, team] = await Promise.all([transaction.get(membershipRef), transaction.get(teamRef)]);
      if (membership.data()?.status !== 'active' || membership.data()?.role !== 'owner') throw new Error('FORBIDDEN');
      if (!team.exists || team.data()?.status === 'archived') throw new Error('NOT_FOUND');
      transaction.update(teamRef, { name, updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ name });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ error: 'Only the workspace owner can change its settings.' }, { status: 403 });
    if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    console.error('Unable to rename workspace:', error);
    return NextResponse.json({ error: 'Unable to update the workspace.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/teams/[id]'>) {
  const { id } = await context.params;
  const authorization = await authorize(request, id);
  if ('error' in authorization) return authorization.error;
  const db = getAdminDb();
  const userRef = db.collection('users').doc(authorization.session.uid);
  const membershipRef = userRef.collection('teamMemberships').doc(id);
  const teamRef = db.collection('teams').doc(id);
  try {
    const fallbackId = await db.runTransaction(async (transaction) => {
      const [user, membership, team, memberships] = await Promise.all([
        transaction.get(userRef), transaction.get(membershipRef), transaction.get(teamRef),
        transaction.get(userRef.collection('teamMemberships').where('status', '==', 'active')),
      ]);
      if (membership.data()?.role !== 'owner' || membership.data()?.status !== 'active') throw new Error('FORBIDDEN');
      if (!team.exists || team.data()?.status === 'archived') throw new Error('NOT_FOUND');
      const alternatives = memberships.docs.filter((document) => document.id !== id);
      const teams = await Promise.all(alternatives.map((document) => transaction.get(db.collection('teams').doc(document.id))));
      const fallback = teams.find((document) => document.exists && document.data()?.status !== 'archived');
      if (!fallback) throw new Error('LAST_WORKSPACE');
      transaction.update(teamRef, { status: 'archived', archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.update(membershipRef, { status: 'inactive', updatedAt: FieldValue.serverTimestamp() });
      transaction.update(userRef, {
        activeTeamId: fallback.id,
        ...(user.data()?.defaultTeamId === id ? { defaultTeamId: fallback.id } : {}),
        ...(user.data()?.personalWorkspaceId === id ? { personalWorkspaceId: null } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return fallback.id;
    });
    return NextResponse.json({ href: workspaceLandingHref(fallbackId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'FORBIDDEN') return NextResponse.json({ error: 'Only the workspace owner can delete it.' }, { status: 403 });
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
    if (code === 'LAST_WORKSPACE') return NextResponse.json({ error: 'You must keep at least one workspace.' }, { status: 409 });
    console.error('Unable to delete workspace:', error);
    return NextResponse.json({ error: 'Unable to delete the workspace.' }, { status: 500 });
  }
}
