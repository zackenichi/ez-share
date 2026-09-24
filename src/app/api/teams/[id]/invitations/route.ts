import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/request';
import { findAuthUserByEmail } from '@/lib/auth/invitations';
import { getAdminDb } from '@/lib/firebase/admin';
import { getSessionUser } from '@/lib/firebase/session';
import { createInvitationToken, hashInvitationToken, newExpiration, normalizeEmail, serializeWorkspaceInvitation, workspaceInvitationId } from '@/lib/teams/workspace-invitations';

async function authorize(uid: string, teamId: string) {
  const membership = await getAdminDb().collection('users').doc(uid).collection('teamMemberships').doc(teamId).get();
  return membership.data()?.status === 'active' && (membership.data()?.role === 'owner' || membership.data()?.canShare === true);
}
export async function GET(_: NextRequest, context: RouteContext<'/api/teams/[id]/invitations'>) {
  const session = await getSessionUser(true); if (!session) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params; if (!await authorize(session.uid, id)) return NextResponse.json({ error: 'Share permission is required.' }, { status: 403 });
  const snapshot = await getAdminDb().collection('workspaceInvitations').where('teamId', '==', id).limit(25).get();
  return NextResponse.json({ invitations: snapshot.docs.map((doc) => serializeWorkspaceInvitation(doc.id, doc.data())) });
}
export async function POST(request: NextRequest, context: RouteContext<'/api/teams/[id]/invitations'>) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const session = await getSessionUser(true); if (!session?.email) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { id } = await context.params; if (!await authorize(session.uid, id)) return NextResponse.json({ error: 'Share permission is required.' }, { status: 403 });
  const parsed = z.object({ email: z.email().transform(normalizeEmail), canEdit: z.boolean(), canShare: z.boolean(), canManageAccess: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A valid email and permissions are required.' }, { status: 400 });
  if (normalizeEmail(session.email) === parsed.data.email) return NextResponse.json({ error: 'You cannot invite yourself.' }, { status: 400 });
  const db = getAdminDb(); const teamRef = db.collection('teams').doc(id); const existingUser = await findAuthUserByEmail(parsed.data.email); const token = createInvitationToken(); const expiresAt = newExpiration(); let teamName = 'Workspace';
  if (existingUser && (await db.collection('users').doc(existingUser.uid).collection('teamMemberships').doc(id).get()).data()?.status === 'active') return NextResponse.json({ error: 'This person is already a member.' }, { status: 409 });
  const ref = db.collection('workspaceInvitations').doc(workspaceInvitationId(id, parsed.data.email));
  try { await db.runTransaction(async (transaction) => { const [team, invitation] = await Promise.all([transaction.get(teamRef), transaction.get(ref)]); if (!team.exists || team.data()?.status === 'archived') throw new Error('NOT_FOUND'); if (invitation.data()?.status === 'pending' && invitation.data()!.expiresAt.toMillis() > Date.now()) throw new Error('DUPLICATE'); teamName = team.data()!.name; transaction.set(ref, { teamId: id, teamName, email: parsed.data.email, role: 'member', canEdit: parsed.data.canEdit, canShare: parsed.data.canShare, canManageAccess: parsed.data.canManageAccess, status: 'pending', tokenHash: hashInvitationToken(token), recipientUid: existingUser?.uid ?? null, invitedByUid: session.uid, invitedByName: session.name || session.email, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), expiresAt }); }); }
  catch (error) { if (error instanceof Error && error.message === 'DUPLICATE') return NextResponse.json({ error: 'A pending invitation already exists.' }, { status: 409 }); throw error; }
  return NextResponse.json({ shareUrl: new URL(`/workspace-invite/${token}`, request.nextUrl.origin).toString(), invitation: { id: ref.id, teamId: id, teamName, email: parsed.data.email, canEdit: parsed.data.canEdit, canShare: parsed.data.canShare, canManageAccess: parsed.data.canManageAccess, status: 'pending', expiresAt: expiresAt.toDate().toISOString(), invitedByName: session.name || session.email } }, { status: 201 });
}
