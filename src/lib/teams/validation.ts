export const WORKSPACE_NAME_MAX_LENGTH = 80;

export function validateWorkspaceName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= WORKSPACE_NAME_MAX_LENGTH ? name : null;
}
