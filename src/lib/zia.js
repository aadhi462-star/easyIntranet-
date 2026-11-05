// Zia, the AI assistant. Uses the browser's built-in on-device AI (Chrome's Summarizer,
// Writer and Translator APIs) when present, so no text leaves the device. Otherwise it
// falls back to simple local heuristics and says so via `source`.

const has = (name) => typeof self !== 'undefined' && name in self;

export async function summarize(text) {
  if (has('Summarizer')) {
    try {
      if ((await self.Summarizer.availability()) !== 'unavailable') {
        const s = await self.Summarizer.create({ type: 'tldr', length: 'short', format: 'plain-text' });
        return { text: await s.summarize(text), source: 'on-device AI' };
      }
    } catch { /* fall through */ }
  }
  // Extractive fallback: keep the sentences with the most frequent content words.
  const sentences = text.match(/[^.!?\n]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
  if (sentences.length <= 2) return { text: sentences.join(' '), source: 'local heuristic' };
  const freq = {};
  for (const w of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) freq[w] = (freq[w] || 0) + 1;
  const score = (s) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).reduce((n, w) => n + freq[w], 0) / (s.length ** 0.5);
  const top = [...sentences].sort((a, b) => score(b) - score(a)).slice(0, 2);
  return { text: sentences.filter((s) => top.includes(s)).join(' '), source: 'local heuristic' };
}

export async function write(prompt, tone = 'neutral') {
  if (has('Writer')) {
    try {
      if ((await self.Writer.availability()) !== 'unavailable') {
        const w = await self.Writer.create({ tone: tone === 'casual' ? 'casual' : tone === 'formal' ? 'formal' : 'neutral', length: 'short' });
        return { text: await w.write(prompt), source: 'on-device AI' };
      }
    } catch { /* fall through */ }
  }
  const openers = { casual: 'Hey everyone! 👋', formal: 'Dear members,', neutral: 'Hi all,' };
  return { text: `${openers[tone] ?? openers.neutral} ${prompt.trim().replace(/^\w/, (c) => c.toUpperCase())}${/[.!?]$/.test(prompt.trim()) ? '' : '.'} Let me know your thoughts in the comments.`, source: 'template' };
}

export async function translate(text, target = 'hi') {
  if (has('Translator')) {
    try {
      const t = await self.Translator.create({ sourceLanguage: 'en', targetLanguage: target });
      return { text: await t.translate(text), source: 'on-device AI' };
    } catch { /* fall through */ }
  }
  return { text: null, source: 'unavailable' };
}

const POS = ['great', 'love', 'awesome', 'thanks', 'proud', 'congrats', 'excited', 'happy', 'amazing', 'helpful', 'good', 'wait', '🎉', '❤️', 'cannot wait'];
const NEG = ['bad', 'hate', 'sad', 'angry', 'terrible', 'problem', 'issue', 'disappointed', 'worst', 'broken', 'unfair'];

/** Lexicon sentiment: returns 'happy' | 'neutral' | 'unhappy'. */
export function sentiment(text = '') {
  const t = text.toLowerCase();
  const score = POS.filter((w) => t.includes(w)).length - NEG.filter((w) => t.includes(w)).length;
  return score > 0 ? 'happy' : score < 0 ? 'unhappy' : 'neutral';
}

export const LANGUAGES = [['hi', 'Hindi'], ['ta', 'Tamil'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ja', 'Japanese']];
