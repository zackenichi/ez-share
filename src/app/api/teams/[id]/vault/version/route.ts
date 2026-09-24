import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, route: RouteContext<'/api/teams/[id]/vault/version'>) {
  const session = await getSessionUser(true); if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await route.params;
  if (id === ADMIN_TEAM_ID) return NextResponse.json({ error: 'Workspace access is required.' }, { status: 403 });
  const db = getAdminDb();
  const [membership, team] = await Promise.all([db.collection('users').doc(session.uid).collection('teamMemberships').doc(id).get(), db.collection('teams').doc(id).get()]);
  if (membership.data()?.status !== 'active') return NextResponse.json({ error: 'Workspace access is required.' }, { status: 403 });
  if (!team.exists || team.data()?.status === 'archived') return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  return NextResponse.json({ revision: team.data()?.vaultRevision || 0 }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
