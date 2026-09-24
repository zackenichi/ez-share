import assert from 'node:assert/strict';
import test from 'node:test';

import { isActiveMembershipForTeam, selectAuthorizedTeam, type TeamMembership } from '../src/lib/teams/selection.ts';
import { validateWorkspaceName } from '../src/lib/teams/validation.ts';

const teams = [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }];

test('selects and persists a preferred authorized team', () => {
  assert.equal(selectAuthorizedTeam(teams, 'beta')?.id, 'beta');
});

test('does not select an unauthorized preferred team', () => {
  assert.equal(selectAuthorizedTeam(teams, 'secret')?.id, 'alpha');
});

test('returns the only team and handles an empty membership list', () => {
  assert.equal(selectAuthorizedTeam([teams[1]], undefined)?.id, 'beta');
  assert.equal(selectAuthorizedTeam([], 'alpha'), null);
});

test('requires an active membership for the exact requested team', () => {
  const active: TeamMembership = { teamId: 'alpha', role: 'member', status: 'active', canEdit: false, canShare: false };
  assert.equal(isActiveMembershipForTeam(active, 'alpha'), true);
  assert.equal(isActiveMembershipForTeam(active, 'beta'), false);
  assert.equal(isActiveMembershipForTeam({ ...active, status: 'inactive' }, 'alpha'), false);
  assert.equal(isActiveMembershipForTeam(null, 'alpha'), false);
});

test('normalizes valid workspace names and rejects invalid names', () => {
  assert.equal(validateWorkspaceName('  Product   Team  '), 'Product Team');
  assert.equal(validateWorkspaceName('   '), null);
  assert.equal(validateWorkspaceName('x'.repeat(81)), null);
  assert.equal(validateWorkspaceName(42), null);
});
