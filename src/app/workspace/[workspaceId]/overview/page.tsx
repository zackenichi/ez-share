import { redirect } from 'next/navigation';
import { workspaceLandingHref } from '@/lib/teams/routes';

export default async function LegacyWorkspaceOverview({ params }: PageProps<'/workspace/[workspaceId]/overview'>) {
  const { workspaceId } = await params;
  redirect(workspaceLandingHref(workspaceId));
}
