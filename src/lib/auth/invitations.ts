import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import type { AppRole } from '@/config/auth';

export const ADMIN_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminInvitation = {
  id: string;
  email: string;
  role: AppRole;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  expiresAt: string;
  createdAt: string | null;
  invitedByName: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function invitationIdForEmail(email: string) {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createInvitationToken() {
  return randomBytes(32).toString('base64url');
}

function serializeInvitation(id: string, data: DocumentData): AdminInvitation {
  return {
    id,
    email: data.email,
    role: data.role === 'admin' ? 'admin' : 'user',
    status: data.status,
    expiresAt: data.expiresAt.toDate().toISOString(),
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    invitedByName: data.invitedByName || 'An administrator',
  };
}

export async function findAuthUserByEmail(email: string) {
  return getAdminAuth().getUserByEmail(email).catch((error: unknown) => {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'auth/user-not-found') return null;
    throw error;
  });
}

export async function listAdminInvitations() {
  const snapshot = await getAdminDb().collection('adminInvitations').orderBy('createdAt', 'desc').limit(25).get();
  return snapshot.docs.map((doc) => serializeInvitation(doc.id, doc.data()));
}

export async function getPendingAdminInvitation(uid: string, verifiedEmail?: string) {
  if (!verifiedEmail) return null;
  const ref = getAdminDb().collection('adminInvitations').doc(invitationIdForEmail(verifiedEmail));
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data()!;
  if (data.status !== 'pending' || data.recipientUid !== uid || data.expiresAt.toMillis() <= Date.now()) return null;
  return serializeInvitation(snapshot.id, data);
}

export async function getPendingAdminInvitationByToken(token: string) {
  const tokenHash = hashInvitationToken(token);
  const snapshot = await getAdminDb().collection('adminInvitations').where('tokenHash', '==', tokenHash).limit(1).get();
  const document = snapshot.docs[0];
  if (!document) return null;
  const data = document.data();
  const expected = Buffer.from(data.tokenHash, 'hex');
  const actual = Buffer.from(tokenHash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) return null;
  return serializeInvitation(document.id, data);
}

export async function claimPendingAdminInvitation(uid: string, verifiedEmail: string) {
  const normalizedEmail = normalizeEmail(verifiedEmail);
  const ref = getAdminDb().collection('adminInvitations').doc(invitationIdForEmail(normalizedEmail));
  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const data = snapshot.data()!;
    if (data.email !== normalizedEmail || data.status !== 'pending' || data.expiresAt.toMillis() <= Date.now()) return;
    transaction.update(ref, { recipientUid: uid, claimedAt: FieldValue.serverTimestamp() });
  });
}

export function newExpiration() {
  return Timestamp.fromMillis(Date.now() + ADMIN_INVITATION_TTL_MS);
}
