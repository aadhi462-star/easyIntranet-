// Profiles, the member directory and the institution → department → batch structure.
// Edge cases USR-01…10 are referenced where they're handled. v2 D10: a profile's communities and
// posts (GET /profiles/:id/communities, /posts) follow the same rules as the profile itself, and
// `?as=member|connection` on your own profile builds the answer for a stand-in viewer (VIS-16).
import { audit } from '../lib/audit.js';
import { newId, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { access, sectionOn } from '../lib/community.js';
import { authorize, can } from '../lib/permissions.js';
import { UNIQUE_VIOLATION } from '../db/index.js';
import { notBlockedSql, relation } from '../lib/relations.js';

const LIMITS = { name: 80, headline: 120, bio: 2000, city: 80, country: 80, company: 120, jobTitle: 120, linkedin: 100, programme: 120, skill: 40, skills: 30, rows: 20 };
const YEAR_MIN = 1950;
const yearMax = () => new Date().getFullYear() + 6;

// Plain text only: trim, drop control characters (keep newlines in long text) and enforce a
// length. Output is escaped by the web app, so markup is shown as text, never run (USR-02).
function cleanText(value, max, { multiline = false, field } = {}) {
  if (value == null) return null;
  if (typeof value !== 'string') throw badRequest('INVALID_INPUT', `“${field}” must be text.`, { field });
  const pattern = multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  const text = value.replace(pattern, '').trim();
  if (text.length > max) throw badRequest('TOO_LONG', `“${field}” can be at most ${max} characters.`, { field });
  return text || null;
}

function cleanYear(value, field) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < YEAR_MIN || n > yearMax()) throw badRequest('INVALID_YEAR', `Enter a year between ${YEAR_MIN} and ${yearMax()} for ${field}.`, { field });
  return n;
}

function cleanBirthday(value) {
  if (value == null || value === '') return null;
  const m = /^(\d{2})-(\d{2})$/.exec(String(value));
  const month = Number(m?.[1]); const day = Number(m?.[2]);
  // 2024 is a leap year, so 29 February is accepted.
  const ok = m && month >= 1 && month <= 12 && day >= 1 && day <= new Date(2024, month, 0).getDate();
  if (!ok) throw badRequest('INVALID_BIRTHDAY', 'Choose a real month and day for your birthday.', { field: 'birthday' });
  return value;
}

function cleanSkills(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw badRequest('INVALID_INPUT', 'Skills must be a list.', { field: 'skills' });
  const seen = new Set(); const out = [];
  for (const s of list) {
    const t = cleanText(s, LIMITS.skill, { field: 'skills' });
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  if (out.length > LIMITS.skills) throw badRequest('TOO_MANY', `Add at most ${LIMITS.skills} skills.`, { field: 'skills' });
  return out;
}

const PROFILE_SQL = `
  select u.id, u.name, u.email, u.status, u.created_at, p.*,
    coalesce((select json_agg(json_build_object('id', e.id, 'institutionId', e.institution_id, 'institution', i.name,
        'departmentId', e.department_id, 'department', d.name, 'programme', e.programme, 'gradYear', e.grad_year, 'isPrimary', e.is_primary)
        order by e.is_primary desc, e.position)
      from education e join institutions i on i.id = e.institution_id left join departments d on d.id = e.department_id
      where e.user_id = u.id), '[]') as education,
    coalesce((select json_agg(json_build_object('title', x.title, 'org', x.org, 'fromYear', x.from_year, 'toYear', x.to_year) order by x.position)
      from experience x where x.user_id = u.id), '[]') as experience
  from users u join profiles p on p.user_id = u.id`;

/** Shapes a profile row for a viewer: contact details follow the owner's privacy choice. */
function present(row, viewer, rel) {
  const self = viewer?.id === row.id;
  const staff = can(viewer, 'users.view');
  const showContact = self || staff || row.contact_visibility === 'everyone'
    || (row.contact_visibility === 'connections' && rel?.connection === 'connected');
  const primary = row.education.find((e) => e.isPrimary) ?? row.education[0] ?? null;
  return {
    id: row.id, name: row.name, status: row.status, joinedAt: row.created_at,
    headline: row.headline, bio: row.bio, city: row.city, country: row.country, company: row.company, jobTitle: row.job_title,
    skills: row.skills, interests: row.interests, mentorOpen: row.mentor_open, avatarHue: row.avatar_hue,
    customFields: row.custom_fields, education: row.education, experience: row.experience,
    batch: primary?.gradYear ?? null, department: primary?.department ?? null, institution: primary?.institution ?? null,
    email: showContact ? row.email : null, birthday: showContact ? row.birthday : null, linkedin: showContact ? row.linkedin : null,
    contactHidden: !showContact,
    ...(rel && !self ? { connection: rel.connection, blockedByMe: rel.blockedByMe } : {}),
    ...(self ? { contactVisibility: row.contact_visibility, directoryVisible: row.directory_visible, completenessDismissed: row.completeness_dismissed, version: row.version } : {}),
  };
}

export default async function profileRoutes(app, { ctx }) {
  const { db } = ctx;
  const requireMember = (req) => { if (!req.user) throw unauthorized(); };

  const loadProfile = async (id, q = db) => (await q.query(`${PROFILE_SQL} where u.id = $1`, [id])).rows[0];

  // ---- Institutions ---------------------------------------------------------------------------
  app.get('/institutions', async (req) => {
    requireMember(req);
    const { rows } = await db.query(
      `select i.id, i.name, i.short_name, i.city, i.country,
              coalesce(json_agg(json_build_object('id', d.id, 'name', d.name) order by d.name) filter (where d.id is not null), '[]') as departments
         from institutions i left join departments d on d.institution_id = i.id group by i.id order by i.name`);
    return { institutions: rows };
  });

  // ---- Directory ------------------------------------------------------------------------------
  // Only active members who appear in the directory; paginated (SYS-01).
  app.get('/directory', async (req) => {
    requireMember(req);
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [q, req.query.institution || null, req.query.department || null, req.query.batch ? Number(req.query.batch) : null,
      req.query.city ? String(req.query.city).toLowerCase() : null, req.query.company ? String(req.query.company).toLowerCase() : null,
      req.query.skill ? String(req.query.skill).toLowerCase() : null];
    const where = `u.status = 'active' and (p.directory_visible or u.id = $8) and ${notBlockedSql('u.id', '$8')}
      and ($1 = '' or lower(u.name || ' ' || coalesce(p.headline, '') || ' ' || coalesce(p.job_title, '') || ' ' || coalesce(p.company, '') || ' ' || coalesce(p.city, '') || ' ' || array_to_string(p.skills, ' ')) like '%' || $1 || '%'
        or exists (select 1 from education e join departments d on d.id = e.department_id where e.user_id = u.id and d.name_norm like '%' || $1 || '%'))
      and ($2::text is null or exists (select 1 from education e where e.user_id = u.id and e.institution_id = $2))
      and ($3::text is null or exists (select 1 from education e where e.user_id = u.id and e.department_id = $3))
      and ($4::int is null or exists (select 1 from education e where e.user_id = u.id and e.grad_year = $4))
      and ($5::text is null or lower(p.city) = $5)
      and ($6::text is null or lower(p.company) = $6)
      and ($7::text is null or exists (select 1 from unnest(p.skills) s where lower(s) = $7))`;
    const total = (await db.query(`select count(*)::int as n from users u join profiles p on p.user_id = u.id where ${where}`, [...params, req.user.id])).rows[0].n;
    const { rows } = await db.query(`${PROFILE_SQL} where ${where} order by lower(u.name), u.id limit $9 offset $10`, [...params, req.user.id, limit, offset]);
    return { total, limit, offset, people: rows.map((r) => present(r, req.user)) };
  });

  app.get('/directory/facets', async (req) => {
    requireMember(req);
    const visible = `u.status = 'active' and p.directory_visible`;
    const [batches, departments, cities, companies, skills] = await Promise.all([
      db.query(`select distinct e.grad_year as v from education e join users u on u.id = e.user_id join profiles p on p.user_id = u.id where ${visible} and e.grad_year is not null order by v desc`),
      db.query(`select distinct d.id, d.name from education e join departments d on d.id = e.department_id join users u on u.id = e.user_id join profiles p on p.user_id = u.id where ${visible} order by d.name`),
      db.query(`select distinct p.city as v from profiles p join users u on u.id = p.user_id where ${visible} and p.city is not null order by v`),
      db.query(`select distinct p.company as v from profiles p join users u on u.id = p.user_id where ${visible} and p.company is not null order by v`),
      db.query(`select distinct s as v from profiles p join users u on u.id = p.user_id, unnest(p.skills) s where ${visible} order by v`),
    ]);
    return { batches: batches.rows.map((r) => r.v), departments: departments.rows, cities: cities.rows.map((r) => r.v), companies: companies.rows.map((r) => r.v), skills: skills.rows.map((r) => r.v) };
  });

  // ---- Profiles -------------------------------------------------------------------------------
  // 'me' is the signed-in person. `as` (preview, D10) is accepted only on your own profile: the
  // answer is built for a stand-in viewer, a signed-in member with that relationship to you, no
  // platform role and no community in common, so the browser never works out what to hide.
  const targetOf = (req) => (req.params.id === 'me' ? req.user.id : req.params.id);
  function previewOf(req, id) {
    const as = req.query.as;
    if (as == null || as === '') return null;
    if (id !== req.user.id) throw forbidden('You can preview only your own profile.', 'PREVIEW_OWN_ONLY');
    if (!['member', 'connection'].includes(as)) throw badRequest('INVALID_INPUT', 'Preview as a member or as a connection.', { field: 'as' });
    return as;
  }
  // Never a real account: ids are generated by the server and never contain a colon.
  const STAND_IN = Object.freeze({ id: 'preview:stand-in', status: 'active', roles: [] });

  /**
   * Who is looking at whose profile, with the profile's own rules applied once for all three
   * routes: deleted members are a placeholder (USR-09); suspended, deactivated or pending ones
   * exist only for staff; someone who blocked you looks like they don't exist.
   */
  async function viewing(req) {
    requireMember(req);
    const id = targetOf(req);
    const as = previewOf(req, id);
    const row = await loadProfile(id);
    if (!row) throw notFound('That member doesn’t exist.');
    if (row.status === 'deleted') return { row, deleted: true };
    const viewer = as ? STAND_IN : req.user;
    const staff = can(viewer, 'users.view');
    if (row.status !== 'active' && row.id !== viewer.id && !staff) throw notFound('That member doesn’t exist.');
    const rel = as ? { connection: as === 'connection' ? 'connected' : 'none', blockedByMe: false, blockedMe: false } : await relation(db, req.user.id, row.id);
    if (rel.blockedMe && !staff) throw notFound('That member doesn’t exist.');
    // The request access() sees: the viewer (or stand-in) as themselves, never in admin mode.
    const viewerReq = { user: viewer, headers: {}, url: req.url, method: 'GET', ip: req.ip };
    return { row, viewer, viewerReq, rel, as };
  }

  app.get('/profiles/:id', async (req) => {
    const v = await viewing(req);
    if (v.deleted) return { profile: { id: v.row.id, name: 'Deleted member', deleted: true } };
    return { profile: { ...present(v.row, v.viewer, v.rel), ...(v.as ? { preview: v.as } : {}) } };
  });

  // Communities on a profile: ones the viewer shares with that person (both active or
  // restricted members), then that person's Public ones. A Private or Closed membership the
  // viewer isn't part of never appears, not even as a count (VIS-16). Each community is
  // checked with the same access() its own page uses.
  app.get('/profiles/:id/communities', async (req) => {
    const v = await viewing(req);
    if (v.deleted) return { communities: [] };
    const { rows } = await db.query(
      `select c.id, c.slug, c.name, c.accent, c.category, c.visibility, c.status, m.role, m.state
         from memberships m join communities c on c.id = m.community_id
        where m.user_id = $1 and m.state in ('active', 'restricted') and c.merged_into is null and c.status not in ('deleted')
        order by lower(c.name), c.id`, [v.row.id]);
    const out = [];
    for (const c of rows) {
      const a = await access(db, v.viewerReq, c.id, { audited: false }).catch(() => null);
      if (!a) continue;
      const shared = a.member;
      if (!shared && !(c.visibility === 'public' && c.status === 'active')) continue;
      out.push({ id: c.id, slug: c.slug, name: c.name, accent: c.accent, category: c.category, visibility: c.visibility,
        role: c.state === 'active' ? c.role : 'member', shared });
    }
    out.sort((x, y) => Number(y.shared) - Number(x.shared));
    return { communities: out };
  });

  // That person's published posts, newest first, 20 at a time, with the feed's rules: only
  // communities the viewer can read with Discussions switched on, never drafts, scheduled,
  // pending, removed or deleted posts, and nothing across a block either way (SRC-02, CNT-15).
  // `before` is the `next` of the previous page.
  const PAGE = 20;
  app.get('/profiles/:id/posts', async (req) => {
    const v = await viewing(req);
    if (v.deleted) return { posts: [], next: null };
    let before = null; let beforeId = null;
    if (req.query.before) {
      // The database's own timestamp text, so posts a fraction of a millisecond apart aren't skipped.
      const [at, id] = String(req.query.before).split('|');
      if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/.test(at) || Number.isNaN(Date.parse(at.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')))) {
        throw badRequest('INVALID_INPUT', 'That page marker isn’t valid.', { field: 'before' });
      }
      before = at; beforeId = id || null;
    }
    const { rows: where } = await db.query(
      `select distinct community_id from posts where author_id = $1 and status = 'published' and deleted_at is null`, [v.row.id]);
    const readable = [];
    for (const { community_id: id } of where) {
      const a = await access(db, v.viewerReq, id, { audited: false }).catch(() => null);
      if (a?.canView && sectionOn(a.community, 'discussions')) readable.push(id);
    }
    const { rows } = await db.query(
      `select p.id, p.body, p.type, p.community_id, coalesce(p.published_at, p.created_at) as at, coalesce(p.published_at, p.created_at)::text as at_key, c.slug, c.name
         from posts p join communities c on c.id = p.community_id
        where p.author_id = $1 and p.community_id = any($2) and p.status = 'published' and p.deleted_at is null
          and ${notBlockedSql('p.author_id', '$3')}
          and ($4::timestamptz is null or coalesce(p.published_at, p.created_at) < $4
               or ($5::text is not null and coalesce(p.published_at, p.created_at) = $4 and p.id < $5))
        order by at desc, p.id desc limit $6`, [v.row.id, readable, v.viewer.id, before, beforeId, PAGE + 1]);
    const page = rows.slice(0, PAGE);
    const last = page.at(-1);
    return {
      posts: page.map((p) => ({ id: p.id, excerpt: p.body.length > 280 ? `${p.body.slice(0, 280).trim()}…` : p.body, type: p.type,
        publishedAt: p.at, community: { id: p.community_id, slug: p.slug, name: p.name } })),
      next: rows.length > PAGE ? `${last.at_key}|${last.id}` : null,
    };
  });

  app.patch('/profiles/me', {
    schema: { body: { type: 'object', required: ['version'], additionalProperties: false, properties: {
      version: { type: 'integer' }, name: { type: 'string' }, headline: { type: ['string', 'null'] }, bio: { type: ['string', 'null'] },
      city: { type: ['string', 'null'] }, country: { type: ['string', 'null'] }, company: { type: ['string', 'null'] }, jobTitle: { type: ['string', 'null'] },
      skills: { type: 'array' }, interests: { type: 'array' }, birthday: { type: ['string', 'null'] }, linkedin: { type: ['string', 'null'] },
      mentorOpen: { type: 'boolean' }, customFields: { type: 'object' }, contactVisibility: { type: 'string', enum: ['everyone', 'connections', 'nobody'] },
      directoryVisible: { type: 'boolean' }, completenessDismissed: { type: 'boolean' }, education: { type: 'array' }, experience: { type: 'array' } } } },
  }, async (req) => {
    requireMember(req);
    const b = req.body;
    const fields = {};
    if ('name' in b) {
      const name = cleanText(b.name, LIMITS.name, { field: 'name' });
      if (!name) throw badRequest('REQUIRED', 'Enter your name.', { field: 'name' }); // USR-01
      fields.name = name;
    }
    const text = { headline: ['headline', LIMITS.headline], city: ['city', LIMITS.city], country: ['country', LIMITS.country],
      company: ['company', LIMITS.company], job_title: ['jobTitle', LIMITS.jobTitle], linkedin: ['linkedin', LIMITS.linkedin] };
    const profile = {};
    for (const [col, [key, max]] of Object.entries(text)) if (key in b) profile[col] = cleanText(b[key], max, { field: key });
    if ('bio' in b) profile.bio = cleanText(b.bio, LIMITS.bio, { multiline: true, field: 'bio' });
    if ('skills' in b) profile.skills = cleanSkills(b.skills);
    if ('interests' in b) profile.interests = cleanSkills(b.interests);
    if ('birthday' in b) profile.birthday = cleanBirthday(b.birthday);
    if ('mentorOpen' in b) profile.mentor_open = b.mentorOpen;
    if ('contactVisibility' in b) profile.contact_visibility = b.contactVisibility;
    if ('directoryVisible' in b) profile.directory_visible = b.directoryVisible;
    if ('completenessDismissed' in b) profile.completeness_dismissed = b.completenessDismissed;
    if ('customFields' in b) {
      const cf = {};
      for (const [k, v] of Object.entries(b.customFields).slice(0, 20)) {
        if (!/^[a-z][a-z0-9_]{0,30}$/.test(k)) throw badRequest('INVALID_INPUT', 'Unknown profile field.', { field: 'customFields' });
        cf[k] = cleanText(String(v ?? ''), 200, { field: k });
      }
      profile.custom_fields = JSON.stringify(cf);
    }

    let education = null;
    if ('education' in b) {
      if (b.education.length > LIMITS.rows) throw badRequest('TOO_MANY', 'That’s too many education entries.');
      education = b.education.map((e, i) => ({
        institutionId: String(e.institutionId ?? ''), departmentId: e.departmentId ? String(e.departmentId) : null,
        programme: cleanText(e.programme ?? null, LIMITS.programme, { field: `education[${i}].programme` }),
        gradYear: cleanYear(e.gradYear, `education ${i + 1}`), isPrimary: !!e.isPrimary, position: i,
      }));
      if (education.filter((e) => e.isPrimary).length > 1) throw badRequest('INVALID_INPUT', 'Only one education entry can be your main one.');
      if (education.length && !education.some((e) => e.isPrimary)) education[0].isPrimary = true;
    }
    let experience = null;
    if ('experience' in b) {
      if (b.experience.length > LIMITS.rows) throw badRequest('TOO_MANY', 'That’s too many career entries.');
      experience = b.experience.map((x, i) => {
        const title = cleanText(x.title ?? '', 120, { field: `experience[${i}].title` });
        const org = cleanText(x.org ?? '', 120, { field: `experience[${i}].org` });
        if (!title || !org) throw badRequest('REQUIRED', `Career entry ${i + 1} needs a role and an organisation.`, { field: `experience[${i}]` });
        const fromYear = cleanYear(x.fromYear, `career entry ${i + 1}`); const toYear = cleanYear(x.toYear, `career entry ${i + 1}`);
        if (fromYear && toYear && toYear < fromYear) throw badRequest('INVALID_YEAR', `Career entry ${i + 1} ends before it starts.`, { field: `experience[${i}]` });
        return { title, org, fromYear, toYear, position: i };
      });
    }

    try {
      await db.tx(async (t) => {
        // Version check: an edit made from a stale copy (another tab, another admin) is refused
        // instead of silently overwriting the newer save (USR-10, REG-16).
        const bump = await t.query(`update profiles set version = version + 1, updated_at = now() where user_id = $1 and version = $2 returning version`, [req.user.id, b.version]);
        if (!bump.rows.length) throw conflict('STALE_VERSION', 'Your profile changed somewhere else. Reload it, then make your edit again.');
        const cols = Object.keys(profile);
        if (cols.length) {
          await t.query(`update profiles set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where user_id = $1`, [req.user.id, ...cols.map((c) => profile[c])]);
        }
        if (fields.name) await t.query(`update users set name = $2, updated_at = now() where id = $1`, [req.user.id, fields.name]);
        if (education) {
          for (const e of education) {
            const inst = await t.query(`select 1 from institutions where id = $1`, [e.institutionId]);
            if (!inst.rows.length) throw badRequest('INVALID_INPUT', 'Choose an institution from the list.', { field: 'education' });
            if (e.departmentId) {
              const dep = await t.query(`select 1 from departments where id = $1 and institution_id = $2`, [e.departmentId, e.institutionId]);
              if (!dep.rows.length) throw badRequest('INVALID_INPUT', 'That department doesn’t belong to the chosen institution.', { field: 'education' });
            }
          }
          await t.query(`delete from education where user_id = $1`, [req.user.id]);
          for (const e of education) {
            await t.query(`insert into education (user_id, institution_id, department_id, programme, grad_year, is_primary, position) values ($1, $2, $3, $4, $5, $6, $7)`,
              [req.user.id, e.institutionId, e.departmentId, e.programme, e.gradYear, e.isPrimary, e.position]);
          }
        }
        if (experience) {
          await t.query(`delete from experience where user_id = $1`, [req.user.id]);
          for (const x of experience) {
            await t.query(`insert into experience (user_id, title, org, from_year, to_year, position) values ($1, $2, $3, $4, $5, $6)`,
              [req.user.id, x.title, x.org, x.fromYear, x.toYear, x.position]);
          }
        }
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err.code === '23514') throw badRequest('INVALID_INPUT', 'One of the values isn’t allowed.');
      throw err;
    }
    await audit(db, { actorId: req.user.id, action: 'profile.update', targetType: 'user', targetId: req.user.id, context: { fields: [...Object.keys(fields), ...Object.keys(profile), ...(education ? ['education'] : []), ...(experience ? ['experience'] : [])] }, ip: req.ip });
    return { profile: present(await loadProfile(req.user.id), req.user) };
  });

  // Personal data export (USR-08): re-entering the password confirms it's really the member.
  app.post('/account/export', async (req) => {
    requireMember(req);
    const { rows: [u] } = await db.query(`select * from users where id = $1`, [req.user.id]);
    if (!(await verifyPassword(String(req.body?.password ?? ''), u.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your password isn’t right.');
    const profile = present(await loadProfile(u.id), req.user);
    const sessions = (await db.query(`select created_at, last_seen_at, expires_at, revoked_at, ip, user_agent from sessions where user_id = $1 order by created_at desc`, [u.id])).rows;
    const activity = (await db.query(`select at, action, target_type, target_id from audit_log where actor_id = $1 or target_id = $1 order by at desc limit 500`, [u.id])).rows;
    await audit(db, { actorId: u.id, action: 'account.export', targetType: 'user', targetId: u.id, ip: req.ip });
    return { exportedAt: new Date().toISOString(), account: { id: u.id, email: u.email, name: u.name, status: u.status, createdAt: u.created_at }, profile, sessions, activity };
  });

  // ---- Institution administration -------------------------------------------------------------
  app.post('/admin/institutions', { schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: {
    name: { type: 'string' }, shortName: { type: ['string', 'null'] }, city: { type: ['string', 'null'] }, country: { type: ['string', 'null'] } } } } },
  async (req, reply) => {
    authorize(req.user, 'institutions.manage');
    const name = cleanText(req.body.name, 160, { field: 'name' });
    if (!name) throw badRequest('REQUIRED', 'Enter the institution’s name.', { field: 'name' });
    const id = newId('ins');
    try {
      await db.query(`insert into institutions (id, name, short_name, city, country) values ($1, $2, $3, $4, $5)`,
        [id, name, cleanText(req.body.shortName, 40, { field: 'shortName' }), cleanText(req.body.city, 80, { field: 'city' }), cleanText(req.body.country, 80, { field: 'country' })]);
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE', 'An institution with that name already exists.');
      throw err;
    }
    await audit(db, { actorId: req.user.id, action: 'institution.create', targetType: 'institution', targetId: id, context: { name }, ip: req.ip });
    reply.status(201);
    return { institution: { id, name } };
  });

  app.post('/admin/institutions/:id/departments', { schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string' } } } } },
    async (req, reply) => {
      authorize(req.user, 'institutions.manage');
      const name = cleanText(req.body.name, 120, { field: 'name' });
      if (!name) throw badRequest('REQUIRED', 'Enter the department’s name.', { field: 'name' });
      if (!(await db.query(`select 1 from institutions where id = $1`, [req.params.id])).rows.length) throw notFound('That institution doesn’t exist.');
      const id = newId('dep');
      try {
        await db.query(`insert into departments (id, institution_id, name) values ($1, $2, $3)`, [id, req.params.id, name]);
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE', 'That institution already has a department with this name.');
        throw err;
      }
      await audit(db, { actorId: req.user.id, action: 'department.create', targetType: 'department', targetId: id, context: { name, institutionId: req.params.id }, ip: req.ip });
      reply.status(201);
      return { department: { id, name } };
    });

  app.patch('/admin/departments/:id', { schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string' } } } } },
    async (req) => {
      authorize(req.user, 'institutions.manage');
      const name = cleanText(req.body.name, 120, { field: 'name' });
      if (!name) throw badRequest('REQUIRED', 'Enter the department’s name.', { field: 'name' });
      try {
        const { rows } = await db.query(`update departments set name = $2 where id = $1 returning id`, [req.params.id, name]);
        if (!rows.length) throw notFound('That department doesn’t exist.');
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE', 'That institution already has a department with this name.');
        throw err;
      }
      await audit(db, { actorId: req.user.id, action: 'department.rename', targetType: 'department', targetId: req.params.id, context: { name }, ip: req.ip });
      return { ok: true };
    });
}
