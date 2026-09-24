'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Copy, Eye, EyeOff, FileKey2, FileText, Folder, FolderPlus, KeyRound, LayoutGrid, List, Minimize2, Plus, Search, Settings, Share2, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useGlobalProgress } from '@/components/global-progress';
import { decryptVaultPayload, encryptOneTimeShare, encryptVaultPayload, exportWorkspaceKey, generateWorkspaceKey, getOrCreateDeviceIdentity, importWorkspaceKey, unwrapWorkspaceKey, wrapWorkspaceKey } from '@/lib/vault/client-crypto';
import type { EncryptedVaultItem } from '@/lib/vault/types';

type CreateType = 'password' | 'note' | 'folder';
type VaultItem = { id: string; type: 'password'; title: string; subtitle: string; folder: string; folderId: string; username: string; password: string; url: string; notes: string } | { id: string; type: 'note'; title: string; subtitle: string; folder: string; folderId: string; note: string };
type VaultFolder = { id: string; name: string };
type FolderMember = { uid: string; name: string; email: string; workspaceCanEdit: boolean; workspaceCanShare: boolean; canView: boolean; canEdit: boolean; canShare: boolean };
type VaultViewMode = 'grid' | 'list';
type VaultItemFilter = 'all' | 'password' | 'note';
type StoredVaultPayload = { kind: 'folder'; name: string } | { kind: 'password'; title: string; username: string; password: string; url: string; notes?: string; folder: string; folderId?: string } | { kind: 'note'; title: string; note: string; folder: string; folderId?: string };
type FolderAccess = { canView: boolean; canEdit: boolean; canShare: boolean };
type VaultBootstrap = { error?: string; access: { role: 'owner' | 'member'; canEdit: boolean; canShare: boolean }; folderAccess: Record<string, FolderAccess>; revision: number; keyInitialized: boolean; workspaceKey: string | null; envelope: string | null; items: EncryptedVaultItem[]; recipients: Array<{ uid: string; deviceId: string; publicKeyJwk: JsonWebKey; hasEnvelope: boolean }> };

const NONE_FOLDER = 'none';

function vaultItemsSignature(items: EncryptedVaultItem[]) {
  return items.map(item => `${item.id}:${item.updatedAt}`).join('|');
}

async function decryptItems(key: CryptoKey, workspaceId: string, encryptedItems: EncryptedVaultItem[]) {
  const decrypted = await Promise.all(encryptedItems.map(async item => ({ id: item.id, payload: await decryptVaultPayload<StoredVaultPayload>(key, workspaceId, item.id, item) })));
  const folders = decrypted.filter(item => item.payload.kind === 'folder').map(item => ({ id: item.id, name: (item.payload as Extract<StoredVaultPayload, { kind: 'folder' }>).name }));
  const items: VaultItem[] = [];
  for (const item of decrypted) {
    const payload = item.payload;
    if (payload.kind === 'folder') continue;
    const folderId = payload.folderId || folders.find(folder => folder.name === payload.folder)?.id || NONE_FOLDER;
    if (payload.kind === 'password') items.push({ id: item.id, type: 'password', title: payload.title, subtitle: payload.username, folder: payload.folder || NONE_FOLDER, folderId, username: payload.username, password: payload.password, url: payload.url, notes: payload.notes || '' });
    else items.push({ id: item.id, type: 'note', title: payload.title, subtitle: payload.note.slice(0, 80), folder: payload.folder || NONE_FOLDER, folderId, note: payload.note });
  }
  return { folders, items };
}

export function VaultView({ workspaceId, canEdit, canShare, canManageAccess, itemType = 'all' }: { workspaceId: string; canEdit: boolean; canShare: boolean; canManageAccess: boolean; isOwner: boolean; itemType?: VaultItemFilter }) {
  const isOwner = canManageAccess;
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [createType, setCreateType] = useState<CreateType | null>(null);
  const [folderValue, setFolderValue] = useState(NONE_FOLDER);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<VaultViewMode>('grid');
  const [openFolders, setOpenFolders] = useState<string[]>([NONE_FOLDER]);
  const [loading, setLoading] = useState(true);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [requestPending, setRequestPending] = useState(false);
  const [accessRequested, setAccessRequested] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [editFolder, setEditFolder] = useState(NONE_FOLDER);
  const [updatePending, setUpdatePending] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [settingsFolder, setSettingsFolder] = useState<VaultFolder | null>(null);
  const [folderMembers, setFolderMembers] = useState<FolderMember[]>([]);
  const [folderSettingsPending, setFolderSettingsPending] = useState(false);
  const [folderAccess, setFolderAccess] = useState<Record<string, FolderAccess>>({});
  const workspaceKey = useRef<CryptoKey | null>(null);
  const itemSignature = useRef('');
  const vaultRevision = useRef(0);
  const progress = useGlobalProgress();
  const visibleItems = useMemo(() => items.filter(item => (itemType === 'all' || item.type === itemType) && (!query.trim() || `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()))), [itemType, items, query]);
  const pageTitle = itemType === 'password' ? 'Passwords' : itemType === 'note' ? 'Notes' : 'Vault';
  const pageDescription = itemType === 'password' ? 'Workspace passwords, encrypted before they’re stored.' : itemType === 'note' ? 'Secure notes, encrypted before they’re stored.' : 'Passwords and secure notes, encrypted before they’re stored.';
  const groups = useMemo(() => {
    return [{ id: NONE_FOLDER, name: 'None' }, ...folders].map(folder => ({ id: folder.id, label: folder.name, items: visibleItems.filter(item => item.folderId === folder.id) }));
  }, [folders, visibleItems]);
  const editableFolders = folders.filter(folder => folderAccess[folder.id]?.canEdit !== false);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      progress.start();
      try {
        const identity = await getOrCreateDeviceIdentity();
        if (!cancelled) setDeviceId(identity.deviceId);
        const register = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'registerDevice', deviceId: identity.deviceId, publicKeyJwk: identity.publicJwk }) });
        if (!register.ok) throw new Error((await register.json()).error || 'Unable to register this device.');
        async function getBootstrap() { const response = await fetch(`/api/teams/${workspaceId}/vault?deviceId=${encodeURIComponent(identity.deviceId)}`, { cache: 'no-store' }); const result = await response.json() as VaultBootstrap; if (!response.ok) throw new Error(result.error || 'Unable to open the Vault.'); return result; }
        let bootstrap = await getBootstrap(); let key: CryptoKey;
        if (!bootstrap.workspaceKey && !bootstrap.envelope && bootstrap.keyInitialized && bootstrap.access.role === 'owner' && bootstrap.items.length === 0) {
          const reset = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resetEmptyVault' }) });
          if (!reset.ok) throw new Error((await reset.json()).error || 'Unable to recover the empty Vault.');
          bootstrap = await getBootstrap();
        }
        if (bootstrap.workspaceKey) key = await importWorkspaceKey(bootstrap.workspaceKey);
        else if (bootstrap.envelope) key = await unwrapWorkspaceKey(bootstrap.envelope, identity.privateKey);
        else if (!bootstrap.keyInitialized && bootstrap.access.role === 'owner') {
          key = await generateWorkspaceKey(); const wrappedKey = await wrapWorkspaceKey(key, identity.publicJwk);
          const response = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'putEnvelope', senderDeviceId: identity.deviceId, deviceId: identity.deviceId, recipientUid: 'self', wrappedKey, initialize: true }) });
          if (!response.ok) {
            const profileResponse = await fetch(`/api/teams/${workspaceId}/vault?deviceId=${encodeURIComponent(identity.deviceId)}`, { cache: 'no-store' });
            const retry = await profileResponse.json() as VaultBootstrap;
            if (!profileResponse.ok || !retry.envelope) throw new Error(retry.error || 'Unable to initialize the Vault.');
            key = await unwrapWorkspaceKey(retry.envelope, identity.privateKey); bootstrap = retry;
          } else bootstrap = await getBootstrap();
        } else { if (!cancelled) { setWaitingForKey(true); setLoading(false); } return; }
        workspaceKey.current = key;
        const encryptedItems = bootstrap.items;
        const decrypted = await decryptItems(key, workspaceId, encryptedItems);
        if (bootstrap.access.role === 'owner' && encryptedItems.length > 0) {
          const metadata = [...decrypted.folders.map(folder => ({ itemId: folder.id, itemKind: 'folder' as const, folderId: folder.id })), ...decrypted.items.map(item => ({ itemId: item.id, itemKind: item.type, folderId: item.folderId }))];
          const migration = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'migrateMetadata', items: metadata }) });
          if (!migration.ok) throw new Error((await migration.json()).error || 'Unable to prepare folder permissions.');
        }
        if (!bootstrap.workspaceKey && bootstrap.access.canShare) {
          const escrowResponse = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'escrowWorkspaceKey', deviceId: identity.deviceId, workspaceKey: await exportWorkspaceKey(key) }) });
          if (!escrowResponse.ok && escrowResponse.status !== 409) throw new Error((await escrowResponse.json()).error || 'Unable to share the workspace key.');
        }
        if (bootstrap.access.canShare) await Promise.all(bootstrap.recipients.filter(recipient => !recipient.hasEnvelope).map(async recipient => {
          const wrappedKey = await wrapWorkspaceKey(key, recipient.publicKeyJwk);
          const response = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'putEnvelope', senderDeviceId: identity.deviceId, deviceId: recipient.deviceId, recipientUid: recipient.uid, wrappedKey }) });
          if (!response.ok) throw new Error('Unable to grant Vault access to a member device.');
        }));
        if (!cancelled) { itemSignature.current = vaultItemsSignature(encryptedItems); vaultRevision.current = bootstrap.revision || 0; setFolderAccess(bootstrap.folderAccess || {}); setFolders(decrypted.folders); setOpenFolders([NONE_FOLDER, ...decrypted.folders.map(folder => folder.id)]); setItems(decrypted.items); setWaitingForKey(false); }
      } catch (error) { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Unable to open the Vault.'); }
      finally { if (!cancelled) setLoading(false); progress.done(); }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [progress, workspaceId]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    let refreshing = false;
    let lastRefreshAt = 0;
    async function refreshSharedItems() {
      const key = workspaceKey.current;
      if (!key || refreshing || document.visibilityState === 'hidden' || Date.now() - lastRefreshAt < 60_000) return;
      lastRefreshAt = Date.now();
      refreshing = true;
      try {
        const versionResponse = await fetch(`/api/teams/${workspaceId}/vault/version`, { cache: 'no-store' });
        if (!versionResponse.ok) return;
        const versionResult = await versionResponse.json() as { revision?: number };
        if ((versionResult.revision || 0) === vaultRevision.current) return;
        const response = await fetch(`/api/teams/${workspaceId}/vault?deviceId=${encodeURIComponent(deviceId)}&sync=1`, { cache: 'no-store' });
        if (!response.ok) return;
        const bootstrap = await response.json() as VaultBootstrap;
        if (!cancelled) setFolderAccess(bootstrap.folderAccess || {});
        const signature = vaultItemsSignature(bootstrap.items);
        if (signature === itemSignature.current) { vaultRevision.current = bootstrap.revision || 0; return; }
        const decrypted = await decryptItems(key, workspaceId, bootstrap.items);
        if (!cancelled) {
          itemSignature.current = signature;
          vaultRevision.current = bootstrap.revision || 0;
          setFolders(decrypted.folders);
          setItems(decrypted.items);
        }
      } catch { lastRefreshAt = 0; /* Keep the current local view and retry after the next focus. */ }
      finally { refreshing = false; }
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refreshSharedItems(); };
    const onFocus = () => { void refreshSharedItems(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [deviceId, workspaceId]);

  function closeDialog() { setCreateType(null); setFolderValue(NONE_FOLDER); }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!createType) return;
    const key = workspaceKey.current; if (!key) return toast.error('Vault access is not ready.');
    const form = event.currentTarget; const data = new FormData(form); const itemId = crypto.randomUUID();
    let payload: StoredVaultPayload;
    if (createType === 'folder') {
      const name = String(data.get('name') || '').trim();
      if (!name || folders.some(folder => folder.name.toLowerCase() === name.toLowerCase())) return toast.error('Use a unique folder name.');
      payload = { kind: 'folder', name };
    } else if (createType === 'password') {
      const enteredUrl = String(data.get('url') || '').trim();
      let url = '';
      if (enteredUrl) {
        try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(enteredUrl) ? enteredUrl : `https://${enteredUrl}`).toString(); }
        catch { return toast.error('Enter a valid website address.'); }
      }
      payload = { kind: 'password', title: String(data.get('title') || '').trim(), username: String(data.get('username') || '').trim(), password: String(data.get('password') || ''), url, notes: String(data.get('notes') || '').trim(), folder: folders.find(folder => folder.id === folderValue)?.name || NONE_FOLDER, folderId: folderValue };
    }
    else payload = { kind: 'note', title: String(data.get('title') || '').trim(), note: String(data.get('note') || ''), folder: folders.find(folder => folder.id === folderValue)?.name || NONE_FOLDER, folderId: folderValue };
    progress.start();
    try {
      const encrypted = await encryptVaultPayload(key, workspaceId, itemId, payload);
      const response = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'createItem', itemId, ...encrypted, keyVersion: 1, itemKind: payload.kind, folderId: payload.kind === 'folder' ? itemId : payload.folderId || NONE_FOLDER }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'Unable to save this item.');
      if (payload.kind === 'folder') { setFolders(current => [...current, { id: itemId, name: payload.name }]); setOpenFolders(current => [...current, itemId]); }
      else setItems(current => [payload.kind === 'password'
        ? { id: itemId, type: 'password', title: payload.title, subtitle: payload.username, folder: payload.folder, folderId: payload.folderId || NONE_FOLDER, username: payload.username, password: payload.password, url: payload.url, notes: payload.notes || '' }
        : { id: itemId, type: 'note', title: payload.title, subtitle: payload.note.slice(0, 80), folder: payload.folder, folderId: payload.folderId || NONE_FOLDER, note: payload.note }, ...current]);
      toast.success(payload.kind === 'folder' ? 'Folder added.' : payload.kind === 'password' ? 'Password added.' : 'Note added.'); closeDialog();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save this item.'); }
    finally { progress.done(); }
  }

  async function requestAccess() {
    if (!deviceId || requestPending) return; setRequestPending(true); progress.start();
    try {
      const response = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'requestAccess', deviceId }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'Unable to request access.');
      setAccessRequested(true); toast.success('Vault access requested.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to request access.'); }
    finally { setRequestPending(false); progress.done(); }
  }

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = selectedItem; const key = workspaceKey.current;
    if (!current || !key || updatePending) return;
    const data = new FormData(event.currentTarget);
    let payload: StoredVaultPayload;
    if (current.type === 'password') {
      const enteredUrl = String(data.get('url') || '').trim(); let url = '';
      if (enteredUrl) {
        try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(enteredUrl) ? enteredUrl : `https://${enteredUrl}`).toString(); }
        catch { return toast.error('Enter a valid website address.'); }
      }
      payload = { kind: 'password', title: String(data.get('title') || '').trim(), username: String(data.get('username') || '').trim(), password: String(data.get('password') || ''), url, notes: String(data.get('notes') || '').trim(), folder: folders.find(folder => folder.id === editFolder)?.name || NONE_FOLDER, folderId: editFolder };
    } else payload = { kind: 'note', title: String(data.get('title') || '').trim(), note: String(data.get('note') || ''), folder: folders.find(folder => folder.id === editFolder)?.name || NONE_FOLDER, folderId: editFolder };
    if (!payload.title) return toast.error('Enter a name.');
    setUpdatePending(true); progress.start();
    try {
      const encrypted = await encryptVaultPayload(key, workspaceId, current.id, payload);
      const response = await fetch(`/api/teams/${workspaceId}/vault`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateItem', itemId: current.id, ...encrypted, keyVersion: 1, itemKind: payload.kind, folderId: payload.folderId || NONE_FOLDER }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'Unable to update this item.');
      const updated: VaultItem = payload.kind === 'password'
        ? { id: current.id, type: 'password', title: payload.title, subtitle: payload.username, folder: payload.folder, folderId: payload.folderId || NONE_FOLDER, username: payload.username, password: payload.password, url: payload.url, notes: payload.notes || '' }
        : { id: current.id, type: 'note', title: payload.title, subtitle: payload.note.slice(0, 80), folder: payload.folder, folderId: payload.folderId || NONE_FOLDER, note: payload.note };
      setItems(items => items.map(item => item.id === current.id ? updated : item)); setSelectedItem(updated); setEditingItem(false); toast.success('Vault item updated.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update this item.'); }
    finally { setUpdatePending(false); progress.done(); }
  }

  async function shareItemOnce() {
    if (!selectedItem || sharePending) return;
    setSharePending(true); progress.start();
    try {
      const payload: StoredVaultPayload = selectedItem.type === 'password'
        ? { kind: 'password', title: selectedItem.title, username: selectedItem.username, password: selectedItem.password, url: selectedItem.url, notes: selectedItem.notes, folder: selectedItem.folder, folderId: selectedItem.folderId }
        : { kind: 'note', title: selectedItem.title, note: selectedItem.note, folder: selectedItem.folder, folderId: selectedItem.folderId };
      const encrypted = await encryptOneTimeShare(payload);
      const response = await fetch(`/api/teams/${workspaceId}/vault/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: selectedItem.id, ciphertext: encrypted.ciphertext, iv: encrypted.iv, keyId: encrypted.keyId }) });
      const result = await response.json() as { error?: string; token?: string };
      if (!response.ok || !result.token) throw new Error(result.error || 'Unable to create a one-time share.');
      const url = `${window.location.origin}/share/${result.token}#key=${encodeURIComponent(encrypted.key)}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success('One-time link created and copied.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create a one-time share.'); }
    finally { setSharePending(false); progress.done(); }
  }

  async function openFolderSettings(folder: VaultFolder) {
    setSettingsFolder(folder); setFolderMembers([]); setFolderSettingsPending(true); progress.start();
    try {
      const response = await fetch(`/api/teams/${workspaceId}/folders/${folder.id}/permissions`, { cache: 'no-store' });
      const result = await response.json() as { error?: string; members?: FolderMember[] };
      if (!response.ok) throw new Error(result.error || 'Unable to load folder access.');
      setFolderMembers(result.members || []);
    } catch (error) { setSettingsFolder(null); toast.error(error instanceof Error ? error.message : 'Unable to load folder access.'); }
    finally { setFolderSettingsPending(false); progress.done(); }
  }

  async function saveFolderSettings() {
    if (!settingsFolder || folderSettingsPending) return;
    setFolderSettingsPending(true); progress.start();
    try {
      const response = await fetch(`/api/teams/${workspaceId}/folders/${settingsFolder.id}/permissions`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members: folderMembers.map(({ uid, canView, canEdit, canShare }) => ({ uid, canView, canEdit, canShare })) }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || 'Unable to save folder access.');
      setSettingsFolder(null); toast.success('Folder access updated.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save folder access.'); }
    finally { setFolderSettingsPending(false); progress.done(); }
  }

  if (loading) return <div className="grid min-h-72 place-items-center text-sm text-muted-foreground" role="status">Opening encrypted Vault…</div>;
  if (loadError) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6"><h1 className="font-semibold text-destructive">Vault unavailable</h1><p className="mt-1 text-sm text-muted-foreground">{loadError}</p></div>;
  if (waitingForKey) return <div className="rounded-xl border bg-background p-8 text-center"><KeyRound className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 font-semibold">Waiting for Vault access</h1><p className="mt-1 text-sm text-muted-foreground">Request approval from the workspace owner for this browser.</p><div className="mt-4 flex justify-center gap-2"><Button disabled={requestPending || accessRequested} onClick={requestAccess}>{requestPending ? 'Requesting…' : accessRequested ? 'Request sent' : 'Request access'}</Button><Button variant="outline" onClick={() => window.location.reload()}>Check again</Button></div></div>;

  return <div className="relative min-h-[calc(100svh-8rem)] space-y-6 pb-24">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{pageTitle}</h1><p className="mt-2 text-base text-muted-foreground">{pageDescription}</p></div><div className="flex w-full items-center gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${pageTitle.toLowerCase()}`} className="pl-9" /></div><Button type="button" size="icon" variant="outline" aria-label="Collapse all folders" title="Collapse all folders" disabled={openFolders.length === 0} onClick={() => setOpenFolders([])}><Minimize2 /></Button><div className="flex rounded-lg border bg-background p-0.5" role="group" aria-label="Vault view"><Button type="button" size="icon-sm" variant={viewMode === 'list' ? 'secondary' : 'ghost'} aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List /></Button><Button type="button" size="icon-sm" variant={viewMode === 'grid' ? 'secondary' : 'ghost'} aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}><LayoutGrid /></Button></div></div></div>
    <section aria-label={`${pageTitle} by folder`}><div className="mb-2 flex items-center gap-2"><h2 className="font-semibold">{itemType === 'all' ? 'All items' : pageTitle}</h2><span className="text-sm text-muted-foreground">({visibleItems.length})</span></div><Accordion multiple value={openFolders} onValueChange={setOpenFolders}>{groups.map(group => <AccordionItem key={group.id} value={group.id}><div className="flex items-center border-b"><AccordionTrigger className="rounded-none border-0 px-1 hover:no-underline"><span className="flex items-center gap-2"><Folder className="size-4 text-muted-foreground" />{group.label}<span className="text-xs font-normal text-muted-foreground">({group.items.length})</span></span></AccordionTrigger>{isOwner && group.id !== NONE_FOLDER && <Button type="button" size="icon-sm" variant="ghost" className="mr-1 shrink-0" aria-label={`Folder settings for ${group.label}`} onClick={() => void openFolderSettings({ id: group.id, name: group.label })}><Settings /></Button>}</div><AccordionContent className="pt-4">{group.items.length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-background p-6 text-center"><div><FileKey2 className="mx-auto size-7 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">{query ? 'No matching items.' : canEdit ? `No ${itemType === 'all' ? 'items' : pageTitle.toLowerCase()} in this folder. Use the plus button to add one.` : `No ${itemType === 'all' ? 'items' : pageTitle.toLowerCase()} in this folder.`}</p></div></div> : viewMode === 'grid' ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group.items.map(item => <Card key={item.id} className="overflow-hidden py-0"><button type="button" className="w-full text-left" onClick={() => { setSelectedItem(item); setEditFolder(item.folderId); setEditingItem(false); setShowPassword(false); }}><div className={cn('grid h-24 place-items-center text-white', item.type === 'password' ? 'bg-primary' : 'bg-violet-500')}><span className="grid size-11 place-items-center rounded-xl bg-white/15">{item.type === 'password' ? <KeyRound /> : <StickyNote />}</span></div><CardContent className="p-4"><p className="truncate font-medium">{item.title}</p><p className="mt-1 truncate text-sm text-muted-foreground">{item.subtitle || (item.type === 'password' ? 'Password' : 'Secure note')}</p></CardContent></button></Card>)}</div> : <div className="overflow-hidden rounded-xl border bg-background">{group.items.map(item => <button key={item.id} type="button" onClick={() => { setSelectedItem(item); setEditFolder(item.folderId); setEditingItem(false); setShowPassword(false); }} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/60"><span className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-white', item.type === 'password' ? 'bg-primary' : 'bg-violet-500')}>{item.type === 'password' ? <KeyRound className="size-4" /> : <StickyNote className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.subtitle || (item.type === 'password' ? 'Password' : 'Secure note')}</span></span><span className="text-xs capitalize text-muted-foreground">{item.type}</span></button>)}</div>}</AccordionContent></AccordionItem>)}</Accordion></section>

    {canEdit && <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-lg" className="fixed bottom-6 right-6 z-30 size-14 rounded-full shadow-lg" aria-label="Add to vault" />}><Plus className="size-6" /></DropdownMenuTrigger><DropdownMenuContent align="end" side="top" sideOffset={10} className="w-52"><DropdownMenuItem onClick={() => setCreateType('password')}><KeyRound />New password</DropdownMenuItem><DropdownMenuItem onClick={() => setCreateType('note')}><FileText />New secure note</DropdownMenuItem><DropdownMenuItem onClick={() => setCreateType('folder')}><FolderPlus />New folder</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}

    <Dialog open={createType === 'password' || createType === 'folder'} onOpenChange={open => { if (!open) closeDialog(); }}>
      <DialogContent className={createType === 'password' ? 'sm:max-w-3xl' : 'sm:max-w-md'}>
        <form className="grid gap-5" onSubmit={create}>
          <DialogHeader><DialogTitle>{createType === 'password' ? 'Add password' : 'New folder'}</DialogTitle><DialogDescription>{createType === 'folder' ? 'Create a folder to organize vault items.' : 'Encrypted on this device before it is saved.'}</DialogDescription></DialogHeader>
          {createType === 'folder' ? <div><label htmlFor="folder-name" className="mb-2 block text-sm font-medium">Name</label><Input id="folder-name" name="name" required autoFocus maxLength={80} /></div> : <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="password-url" className="mb-2 block text-sm font-medium">Website URL</label><Input id="password-url" name="url" type="text" inputMode="url" placeholder="example.com" autoFocus /></div>
            <div><label htmlFor="password-title" className="mb-2 block text-sm font-medium">Name</label><Input id="password-title" name="title" required maxLength={120} /></div>
            <div><label className="mb-2 block text-sm font-medium">Folder</label><Select value={folderValue} onValueChange={value => setFolderValue(value || NONE_FOLDER)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectItem value={NONE_FOLDER}>None</SelectItem>{editableFolders.map(folder => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select></div>
            <div><label htmlFor="password-username" className="mb-2 block text-sm font-medium">Username or email</label><Input id="password-username" name="username" autoComplete="off" /></div>
            <div><label htmlFor="password-value" className="mb-2 block text-sm font-medium">Password</label><Input id="password-value" name="password" type="password" autoComplete="new-password" /></div>
            <div className="sm:col-span-2"><label htmlFor="password-notes" className="mb-2 block text-sm font-medium">Notes</label><Textarea id="password-notes" name="notes" className="min-h-32 resize-y" /></div>
          </div>}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose><Button type="submit">Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Drawer open={createType === 'note'} onOpenChange={open => { if (!open) closeDialog(); }} swipeDirection="right">
      <DrawerContent style={{ '--drawer-content-width': 'min(52rem, calc(100vw - 2rem))' } as CSSProperties}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={create}>
          <DrawerHeader className="border-b p-5 sm:p-6"><DrawerTitle className="text-xl">Add secure note</DrawerTitle><DrawerDescription>Encrypted on this device before it is saved.</DrawerDescription></DrawerHeader>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-5 sm:p-6">
            <div><label htmlFor="note-title" className="mb-2 block text-sm font-medium">Name</label><Input id="note-title" name="title" required autoFocus maxLength={120} /></div>
            <div className="flex min-h-72 flex-col"><label htmlFor="note-content" className="mb-2 block text-sm font-medium">Note</label><Textarea id="note-content" name="note" required className="min-h-72 flex-1 resize-y" /></div>
            <div><label className="mb-2 block text-sm font-medium">Folder</label><Select value={folderValue} onValueChange={value => setFolderValue(value || NONE_FOLDER)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectItem value={NONE_FOLDER}>None</SelectItem>{editableFolders.map(folder => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DrawerFooter className="flex-row justify-end border-t p-4 sm:p-5"><DrawerClose render={<Button type="button" variant="outline" />}>Cancel</DrawerClose><Button type="submit">Save</Button></DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>

    <Drawer open={selectedItem !== null} onOpenChange={open => { if (!open) { setSelectedItem(null); setEditingItem(false); setShowPassword(false); } }} swipeDirection="right">
      <DrawerContent style={{ '--drawer-content-width': 'min(42rem, calc(100vw - 2rem))' } as CSSProperties}>
        {selectedItem && <form key={`${selectedItem.id}-${editingItem ? 'edit' : 'view'}-${selectedItem.subtitle}`} className="flex min-h-0 flex-1 flex-col" onSubmit={updateItem}>
          <DrawerHeader className="border-b p-5 sm:p-6">{editingItem ? <><label htmlFor="edit-item-title" className="text-sm font-medium">Name</label><Input id="edit-item-title" name="title" required autoFocus defaultValue={selectedItem.title} maxLength={120} /></> : <DrawerTitle className="text-xl">{selectedItem.title}</DrawerTitle>}<DrawerDescription>{editingItem ? `Editing ${selectedItem.type === 'password' ? 'password' : 'secure note'}` : `${selectedItem.type === 'password' ? 'Password' : 'Secure note'} · ${selectedItem.folder === NONE_FOLDER ? 'No folder' : selectedItem.folder}`}</DrawerDescription></DrawerHeader>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-5 sm:p-6">
            {selectedItem.type === 'password' ? <>
              {(editingItem || selectedItem.url) && <div><label htmlFor="edit-item-url" className="mb-2 block text-sm font-medium">Website</label><div className="flex gap-2"><Input id="edit-item-url" name="url" readOnly={!editingItem} defaultValue={selectedItem.url} inputMode="url" />{!editingItem && <Button type="button" size="icon" variant="outline" aria-label="Copy website" onClick={() => { void navigator.clipboard.writeText(selectedItem.url); toast.success('Website copied.'); }}><Copy /></Button>}</div></div>}
              <div><label htmlFor="edit-item-username" className="mb-2 block text-sm font-medium">Username or email</label><div className="flex gap-2"><Input id="edit-item-username" name="username" readOnly={!editingItem} defaultValue={selectedItem.username} />{!editingItem && <Button type="button" size="icon" variant="outline" aria-label="Copy username" onClick={() => { void navigator.clipboard.writeText(selectedItem.username); toast.success('Username copied.'); }}><Copy /></Button>}</div></div>
              <div><label htmlFor="edit-item-password" className="mb-2 block text-sm font-medium">Password</label><div className="flex gap-2"><Input id="edit-item-password" name="password" readOnly={!editingItem} type={showPassword ? 'text' : 'password'} defaultValue={selectedItem.password} /><Button type="button" size="icon" variant="outline" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff /> : <Eye />}</Button>{!editingItem && <Button type="button" size="icon" variant="outline" aria-label="Copy password" onClick={() => { void navigator.clipboard.writeText(selectedItem.password); toast.success('Password copied.'); }}><Copy /></Button>}</div></div>
              {(editingItem || selectedItem.notes) && <div><label htmlFor="edit-item-notes" className="mb-2 block text-sm font-medium">Notes</label><div className="flex items-start gap-2"><Textarea id="edit-item-notes" name="notes" readOnly={!editingItem} defaultValue={selectedItem.notes} className="min-h-40 resize-y" />{!editingItem && <Button type="button" size="icon" variant="outline" aria-label="Copy notes" onClick={() => { void navigator.clipboard.writeText(selectedItem.notes); toast.success('Notes copied.'); }}><Copy /></Button>}</div></div>}
            </> : <div><label htmlFor="edit-item-note" className="mb-2 block text-sm font-medium">Note</label><div className="flex items-start gap-2"><Textarea id="edit-item-note" name="note" readOnly={!editingItem} defaultValue={selectedItem.note} className="min-h-[28rem] resize-y" />{!editingItem && <Button type="button" size="icon" variant="outline" aria-label="Copy note" onClick={() => { void navigator.clipboard.writeText(selectedItem.note); toast.success('Note copied.'); }}><Copy /></Button>}</div></div>}
            {editingItem && <div><label className="mb-2 block text-sm font-medium">Folder</label><Select value={editFolder} onValueChange={value => setEditFolder(value || NONE_FOLDER)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectItem value={NONE_FOLDER}>None</SelectItem>{editableFolders.map(folder => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent></Select></div>}
          </div>
          <DrawerFooter className="flex-row justify-end border-t p-4 sm:p-5">{editingItem ? <><Button type="button" variant="outline" disabled={updatePending} onClick={() => { setEditingItem(false); setEditFolder(selectedItem.folderId); }}>Cancel</Button><Button type="submit" disabled={updatePending}>{updatePending ? 'Saving…' : 'Save changes'}</Button></> : <><DrawerClose render={<Button type="button" variant="outline" />}>Close</DrawerClose>{canShare && folderAccess[selectedItem.folderId]?.canShare !== false && <Button type="button" variant="outline" disabled={sharePending} onClick={shareItemOnce}><Share2 />{sharePending ? 'Creating…' : 'Share once'}</Button>}{canEdit && folderAccess[selectedItem.folderId]?.canEdit !== false && <Button type="button" onClick={() => { setEditFolder(selectedItem.folderId); setEditingItem(true); }}>Edit</Button>}</>}</DrawerFooter>
        </form>}
      </DrawerContent>
    </Drawer>

    <Dialog open={Boolean(shareUrl)} onOpenChange={open => { if (!open) setShareUrl(''); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>One-time share link</DialogTitle><DialogDescription>This link expires in 24 hours and can only be revealed once.</DialogDescription></DialogHeader><div className="flex gap-2"><Input readOnly value={shareUrl} /><Button type="button" size="icon" variant="outline" aria-label="Copy one-time share link" onClick={() => { void navigator.clipboard.writeText(shareUrl); toast.success('Link copied.'); }}><Copy /></Button></div><DialogFooter><DialogClose render={<Button type="button" />}>Done</DialogClose></DialogFooter></DialogContent></Dialog>

    <Dialog open={settingsFolder !== null} onOpenChange={open => { if (!open && !folderSettingsPending) setSettingsFolder(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{settingsFolder?.name} access</DialogTitle><DialogDescription>Folder permissions can restrict, but cannot exceed, each member’s workspace permissions.</DialogDescription></DialogHeader><div className="max-h-[55vh] overflow-y-auto rounded-lg border"><div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] gap-2 bg-muted/60 px-4 py-2 text-xs font-medium uppercase text-muted-foreground"><span>Member</span><span className="text-center">View</span><span className="text-center">Edit</span><span className="text-center">Share</span></div>{folderSettingsPending && folderMembers.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Loading members…</p> : folderMembers.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No other workspace members.</p> : folderMembers.map(member => <div key={member.uid} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] items-center gap-2 border-t px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div><div className="flex justify-center"><Checkbox aria-label={`Allow ${member.name} to view`} checked={member.canView} disabled={folderSettingsPending} onCheckedChange={checked => setFolderMembers(current => current.map(item => item.uid === member.uid ? { ...item, canView: checked === true, canEdit: checked === true ? item.canEdit : false, canShare: checked === true ? item.canShare : false } : item))} /></div><div className="flex justify-center"><Checkbox aria-label={`Allow ${member.name} to edit`} checked={member.canEdit} disabled={folderSettingsPending || !member.canView || !member.workspaceCanEdit} onCheckedChange={checked => setFolderMembers(current => current.map(item => item.uid === member.uid ? { ...item, canEdit: checked === true } : item))} /></div><div className="flex justify-center"><Checkbox aria-label={`Allow ${member.name} to share`} checked={member.canShare} disabled={folderSettingsPending || !member.canView || !member.workspaceCanShare} onCheckedChange={checked => setFolderMembers(current => current.map(item => item.uid === member.uid ? { ...item, canShare: checked === true } : item))} /></div></div>)}</div><DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={folderSettingsPending} />}>Cancel</DialogClose><Button type="button" disabled={folderSettingsPending} onClick={saveFolderSettings}>{folderSettingsPending ? 'Saving…' : 'Save access'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
