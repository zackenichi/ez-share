import { redirect } from 'next/navigation';
import { TeamInvitations, type WorkspaceMember } from '@/components/dashboard/team-invitations';
import { getCurrentProfile } from '@/lib/auth/profile';
import { getAdminDb } from '@/lib/firebase/admin';
import { ADMIN_TEAM_ID } from '@/lib/teams/admin-workspace';
import { serializeWorkspaceInvitation } from '@/lib/teams/workspace-invitations';

const PAGE_SIZE = 10;

export default async function Page({ params, searchParams }: PageProps<'/workspace/[workspaceId]/team'>) {
  const { workspaceId } = await params;
  if (workspaceId === ADMIN_TEAM_ID) redirect('/dashboard/admin');

  const user = await getCurrentProfile();
  if (!user) redirect('/');
  const workspace = user.teamContext.teams.find(team => team.id === workspaceId);
  if (!workspace) redirect('/dashboard');

  const requestedPageValue = (await searchParams).page;
  const requestedPage = Math.max(1, Number.parseInt(Array.isArray(requestedPageValue) ? requestedPageValue[0] : requestedPageValue || '1', 10) || 1);
  const db = getAdminDb();
  const memberQuery = db.collectionGroup('teamMemberships').where('teamId', '==', workspaceId).where('status', '==', 'active');
  const invitationQuery = db.collection('workspaceInvitations').where('teamId', '==', workspaceId).where('status', '==', 'pending');
  const [memberCountResult, invitationCountResult] = await Promise.all([memberQuery.count().get(), invitationQuery.count().get()]);
  const memberCount = memberCountResult.data().count;
  const invitationCount = invitationCountResult.data().count;
  const totalItems = memberCount + invitationCount;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  if (requestedPage !== currentPage) redirect(`/workspace/${workspaceId}/team?page=${currentPage}`);

  const offset = (currentPage - 1) * PAGE_SIZE;
  const memberOffset = Math.min(offset, memberCount);
  const memberLimit = Math.min(PAGE_SIZE, Math.max(0, memberCount - memberOffset));
  const invitationOffset = Math.max(0, offset - memberCount);
  const invitationLimit = PAGE_SIZE - memberLimit;
  const [membershipSnapshot, invitationSnapshot] = await Promise.all([
    memberLimit > 0 ? memberQuery.offset(memberOffset).limit(memberLimit).get() : null,
    invitationLimit > 0 ? invitationQuery.offset(invitationOffset).limit(invitationLimit).get() : null,
  ]);

  const membershipDocs = membershipSnapshot?.docs ?? [];
  const profiles = membershipDocs.length ? await db.getAll(...membershipDocs.map(document => db.collection('users').doc(document.data().userId))) : [];
  const profileById = new Map(profiles.map(profile => [profile.id, profile.data()]));
  const members: WorkspaceMember[] = membershipDocs.map(document => {
    const data = document.data(); const profile = profileById.get(data.userId);
    return { uid: data.userId, name: profile?.displayName || profile?.email?.split('@')[0] || 'Member', email: profile?.email || '', role: data.role === 'owner' ? 'owner' : 'member', canEdit: data.canEdit === true, canShare: data.canShare === true, canManageAccess: data.canManageAccess === true };
  });
  if (memberCount === 0) members.push({ uid: user.uid, name: user.name, email: user.email, role: workspace.role === 'owner' ? 'owner' : 'member', canEdit: workspace.canEdit, canShare: workspace.canShare, canManageAccess: workspace.canManageAccess });

  const invitations = (invitationSnapshot?.docs ?? []).map(document => serializeWorkspaceInvitation(document.id, document.data()));
  const effectiveTotal = totalItems || members.length;
  const dataKey = [workspaceId, currentPage, ...members.map(member => member.uid), ...invitations.map(invitation => invitation.id)].join(':');

  return <TeamInvitations key={dataKey} teamId={workspaceId} canShare={workspace.canShare} isOwner={workspace.role === 'owner'} members={members} initialInvitations={invitations} currentPage={currentPage} totalPages={Math.max(1, Math.ceil(effectiveTotal / PAGE_SIZE))} totalItems={effectiveTotal} />;
}
