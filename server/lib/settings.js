// Platform settings with optimistic versioning (SET-03) and a per-key field allow-list (SET-08).
import { badRequest, conflict } from './errors.js';

// Which fields each settings key accepts, and their types. Anything else is rejected.
const SCHEMAS = {
  general: { name: 'string', tagline: 'string' },
  registration: { open: 'boolean', requireApproval: 'boolean', allowedDomains: 'string[]' },
  security: { sessionDays: 'number', maxFailedLogins: 'number', lockMinutes: 'number' },
};

// Changing these needs Super Admin (critical security configuration, prompt §9).
export const CRITICAL_SETTINGS = new Set(['security']);

export async function getSetting(db, key) {
  const { rows } = await db.query(`select value, version from platform_settings where key = $1`, [key]);
  return rows[0] ? { ...rows[0].value, _version: rows[0].version } : null;
}

export async function updateSetting(db, key, patch, { version, actorId }) {
  const schema = SCHEMAS[key];
  if (!schema) throw badRequest('UNKNOWN_SETTING', 'That setting doesn’t exist.');
  for (const [field, value] of Object.entries(patch)) {
    const type = schema[field];
    if (!type) throw badRequest('FIELD_NOT_ALLOWED', `“${field}” can’t be changed here.`);
    const ok = type === 'string[]' ? Array.isArray(value) && value.every((v) => typeof v === 'string') : typeof value === type;
    if (!ok) throw badRequest('INVALID_INPUT', `“${field}” has the wrong type.`);
  }
  // Only succeeds if nobody saved since the caller loaded `version`.
  const { rows } = await db.query(
    `update platform_settings set value = value || $2::jsonb, version = version + 1, updated_by = $3, updated_at = now()
      where key = $1 and version = $4 returning value, version`,
    [key, JSON.stringify(patch), actorId, version],
  );
  if (!rows.length) throw conflict('STALE_VERSION', 'Someone else changed these settings. Reload to see the latest version.');
  return { ...rows[0].value, _version: rows[0].version };
}
