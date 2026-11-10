// The permission engine. Every route asks `authorize(actor, action)`; nothing relies on the UI
// hiding a button. Phase 1 covers platform-level actions. Phase 2 extends the same function with
// community context (community role → membership state → visibility → feature flags).
import { forbidden, unauthorized } from './errors.js';

// What each platform role may do. Super Admin is the only role that can grant Platform Admin
// or change critical security settings (prompt §9).
const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  platform_admin: [
    'users.view', 'users.manage', 'users.suspend', 'users.approve', 'roles.assign.staff', 'institutions.manage',
    'communities.*', 'learning.*', 'moderation.*', 'settings.platform', 'analytics.platform', 'audit.view',
  ],
  user_manager: ['users.view', 'users.manage', 'users.suspend', 'users.approve', 'institutions.manage'],
  community_manager: ['communities.*'],
  lms_manager: ['learning.*'],
  trust_safety: ['moderation.*', 'users.view', 'users.suspend'],
  finance_manager: ['analytics.revenue'],
  support_agent: ['users.view'],
};

// Assigning these roles needs `roles.assign.critical` (Super Admin only).
const CRITICAL_ROLES = new Set(['super_admin', 'platform_admin']);

export function permissionsFor(roles = []) {
  return roles.flatMap((r) => ROLE_PERMISSIONS[r] || []);
}

export function can(actor, action) {
  if (!actor || actor.status !== 'active') return false;
  return permissionsFor(actor.roles).some((p) => p === '*' || p === action || (p.endsWith('.*') && action.startsWith(p.slice(0, -1))));
}

/** Throws unless the signed-in, active actor may perform `action`. */
export function authorize(actor, action) {
  if (!actor) throw unauthorized();
  if (!can(actor, action)) throw forbidden();
}

export function canAssignRole(actor, role) {
  return CRITICAL_ROLES.has(role) ? can(actor, 'roles.assign.critical') : can(actor, 'roles.assign.staff');
}

export const PLATFORM_ROLES = Object.keys(ROLE_PERMISSIONS);
