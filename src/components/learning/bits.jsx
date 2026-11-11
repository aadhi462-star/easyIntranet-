// Small pieces shared by the Learning screens (Stage 5a boards S5*).
import { Fragment } from 'react';
import { KIND_BADGE, percent } from '../../lib/learning.js';

/** Lime progress bar: progress belongs to CommunityOne, not the community's accent (S5MyLearning). */
export function Progress({ p, label = 'Course progress', className = '' }) {
  const v = percent(p);
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}
      className={`h-1.5 overflow-hidden rounded-full bg-[var(--az-sunken)] ${className}`}>
      <span className="block h-full rounded-full bg-brand-400" style={{ width: `${v}%` }} />
    </div>
  );
}

export function KindBadge({ kind, className = '' }) {
  return <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--az-sunken)] text-[10px] font-bold text-white ${className}`}>{KIND_BADGE[kind] ?? 'TXT'}</span>;
}

export function Pill({ children, tone = 'plain' }) {
  const tones = {
    plain: 'bg-white/[.06] text-slate-200',
    outline: 'border border-[var(--az-hairline)] text-slate-300',
    done: 'bg-brand-400/15 text-brand-300',
    warn: 'bg-amber-500/15 text-amber-200',
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export const STATUS_LABEL = { draft: 'Draft', unpublished: 'Unpublished', archived: 'Archived', published: 'Published' };

const URL_RE = /(https?:\/\/[^\s)]+)/g;
function Linked({ text }) {
  return text.split(URL_RE).map((part, i) => (i % 2
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-300 underline">{part}</a>
    : <Fragment key={i}>{part}</Fragment>));
}

/**
 * Lesson text as the instructor wrote it: blank lines between paragraphs, "## " for a heading,
 * "- " for a list item, and links. Plain text in, so nothing an author types can run as markup.
 */
export function LessonText({ text }) {
  const blocks = (text ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-4 text-base leading-7 text-slate-200">
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) return <h2 key={i} className="t-h2 mt-2 text-white"><Linked text={b.slice(3)} /></h2>;
        const lines = b.split('\n');
        if (lines.every((l) => /^[-•] /.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-6">{lines.map((l, j) => <li key={j}><Linked text={l.slice(2)} /></li>)}</ul>;
        }
        return <p key={i} className="whitespace-pre-line"><Linked text={b} /></p>;
      })}
    </div>
  );
}
