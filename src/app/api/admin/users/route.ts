import { NextResponse, type NextRequest } from 'next/server';

import { getAdminSession } from '@/lib/auth/admin';
import { listManagedUsers } from '@/lib/auth/users';

export async function GET(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 });

  try {
    const pageToken = request.nextUrl.searchParams.get('pageToken') || undefined;
    return NextResponse.json(await listManagedUsers(admin.uid, pageToken));
  } catch (error) {
    console.error('Unable to list users:', error);
    return NextResponse.json({ error: 'Unable to load users.' }, { status: 500 });
  }
}
