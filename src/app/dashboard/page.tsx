import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/profile';
import { getAuthorizedTeam } from '@/lib/teams/teams';
import { workspaceLandingHref } from '@/lib/teams/routes';

export default async function DashboardPage() {
  const user = await getCurrentProfile();
  if (!user) redirect('/');
  const defaultTeam = user.defaultTeamId ? await getAuthorizedTeam(user.uid, user.defaultTeamId) : null;
  const destination = defaultTeam ?? user.teamContext.currentTeam;
  if (destination) redirect(workspaceLandingHref(destination.id));
  return null;
}
