// Copies the voice commentary from the assets repo (imad-os/f_assets) into this game: the MP3s that exist, and a compact
// audio/commentary/library.json (the phrases of every language without their [tone] tags, and which voices each one has).
// Run it again after new audio was generated there:   node tools/commentary-sync.mjs [branch]
// (Node 18+; only changed files are written. The game loads these files from its own site, never from the assets repo.)
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'imad-os/f_assets';
const BRANCH = process.argv[2] || 'main';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'audio', 'commentary');
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
// voice key -> folder in the assets repo (and here)
const VOICES = { en_m: 'en/male', en_f: 'en/female', fr: 'fr', es: 'es', ar: 'ar' };
const LANGS = ['en', 'fr', 'es', 'ar'];

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'rs6-commentary-sync' } });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return r.json();
}
const clean = (s) => String(s || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

const lib = await json(RAW + 'library.json');
const tree = await json(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
const files = new Map(tree.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.size]));

const events = {};
let copied = 0, kept = 0, missing = 0;
for (const e of lib) {
  const voices = [];
  for (const [key, dir] of Object.entries(VOICES)) {
    const src = `audio/${dir}/${e.id}.mp3`;
    if (!files.has(src)) { missing++; continue; }
    voices.push(key);
    const dst = join(ROOT, dir, e.id + '.mp3');
    try { if ((await stat(dst)).size === files.get(src)) { kept++; continue; } } catch (err) { /* new file */ }
    const r = await fetch(RAW + src);
    if (!r.ok) throw new Error(src + ': HTTP ' + r.status);
    await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, Buffer.from(await r.arrayBuffer()));
    copied++;
  }
  const t = {};
  for (const l of LANGS) t[l] = clean((e.translations && e.translations[l] && e.translations[l].phrase) || e['phrase_' + l]);
  (events[e.event] = events[e.event] || []).push({ id: e.id, t, a: voices });
}

const out = JSON.stringify({ v: 1, src: REPO + '@' + tree.sha.slice(0, 7), voices: VOICES, events });
const path = join(ROOT, 'library.json');
let old = '';
try { old = await readFile(path, 'utf8'); } catch (err) { /* first run */ }
if (old !== out) await writeFile(path, out);
console.log(`events ${Object.keys(events).length}, phrases ${lib.length}; mp3 copied ${copied}, unchanged ${kept}, not generated yet ${missing}`);
