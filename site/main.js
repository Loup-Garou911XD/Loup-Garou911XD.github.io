/* Loup: landing page behaviour.
   Three jobs: wax the moon with scroll, reveal cards, and top up the
   repo metadata from the GitHub API when it's reachable. */

const USER = 'Loup-Garou911XD';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── the moon ──────────────────────────────────────────────────────
   k is the illuminated fraction, 0 (new) to 1 (full). The mask is the
   right half of the disc, plus or minus a terminator ellipse whose
   radius is R * |2k - 1|, added past half phase and subtracted before it. */
const R = 80;
const terminator = document.getElementById('terminator');
const pct = document.getElementById('phase-pct');
const root = document.documentElement;

function setPhase(k) {
  k = Math.min(1, Math.max(0.06, k));
  root.style.setProperty('--k', k.toFixed(3));
  if (terminator) {
    terminator.setAttribute('rx', (R * Math.abs(2 * k - 1)).toFixed(2));
    terminator.setAttribute('fill', k >= 0.5 ? '#fff' : '#000');
  }
  if (pct) pct.textContent = Math.round(k * 100);
}

function scrollPhase() {
  const span = document.documentElement.scrollHeight - window.innerHeight;
  const progress = span > 0 ? window.scrollY / span : 1;
  setPhase(0.06 + progress * 0.94);
}

if (reduced) {
  setPhase(1);
  const hint = document.getElementById('wax-hint');
  if (hint) hint.remove();
} else {
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scrollPhase(); });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  scrollPhase();
}

/* ── card reveals ────────────────────────────────────────────────── */
const cards = document.querySelectorAll('.reveal');
if (reduced || !('IntersectionObserver' in window)) {
  cards.forEach(el => el.classList.add('in'));
} else {
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      obs.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  cards.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i, 5) * 55}ms`;
    io.observe(el);
  });
}

/* ── copy the install command ────────────────────────────────────── */
document.querySelectorAll('.copy').forEach(button => {
  button.addEventListener('click', async () => {
    const source = document.querySelector(button.dataset.copy);
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.textContent.trim());
      button.textContent = 'Copied';
      button.dataset.done = '1';
    } catch {
      button.textContent = 'Press ⌘C';
      const range = document.createRange();
      range.selectNodeContents(source);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setTimeout(() => {
      button.textContent = 'Copy';
      delete button.dataset.done;
    }, 2200);
  });
});

/* ── live repo metadata ──────────────────────────────────────────────
   Progressive enhancement only: the page already ships correct numbers,
   this refreshes them. Unauthenticated API, so cache per tab and give up
   quietly on failure. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const stamp = iso => {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

function paint(repos) {
  const byName = new Map(repos.map(r => [r.name, r]));
  document.querySelectorAll('.stars[data-repo]:not([data-repo*="/"])').forEach(el => {
    const repo = byName.get(el.dataset.repo);
    if (!repo) return;
    el.innerHTML = `<b>${repo.stargazers_count}</b> ${repo.stargazers_count === 1 ? 'star' : 'stars'}`;
  });
  document.querySelectorAll('.pushed[data-repo]:not([data-repo*="/"])').forEach(el => {
    const repo = byName.get(el.dataset.repo);
    if (repo) el.textContent = stamp(repo.pushed_at);
  });
}

/* Repos outside this account are keyed by their full owner/name and fetched
   one at a time; the bulk call below only covers repos Loup owns. */
async function fetchRepo(full) {
  const KEY = `gh-repo:${full}`;
  try {
    const cached = sessionStorage.getItem(KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* storage blocked, just fetch */ }
  try {
    const res = await fetch(`https://api.github.com/repos/${full}`);
    if (!res.ok) return null;
    const { stargazers_count, pushed_at } = await res.json();
    const repo = { stargazers_count, pushed_at };
    try { sessionStorage.setItem(KEY, JSON.stringify(repo)); } catch { /* ignore */ }
    return repo;
  } catch {
    return null; /* offline or rate limited, the static numbers stand */
  }
}

async function namedRepoStars() {
  const bare = [...document.querySelectorAll('b[data-stars]')]
    .map(el => [el.dataset.stars, el, 'bare']);
  const labelled = [...document.querySelectorAll('.stars[data-repo*="/"]')]
    .map(el => [el.dataset.repo, el, 'labelled']);

  await Promise.all([...bare, ...labelled].map(async ([full, el, kind]) => {
    const repo = await fetchRepo(full);
    if (!repo) return;
    const n = repo.stargazers_count;
    if (kind === 'bare') el.textContent = n;
    else el.innerHTML = `<b>${n}</b> ${n === 1 ? 'star' : 'stars'}`;
  }));
}
namedRepoStars();

(async () => {
  const KEY = 'gh-repos';
  try {
    const cached = sessionStorage.getItem(KEY);
    if (cached) { paint(JSON.parse(cached)); return; }
  } catch { /* storage blocked, just fetch */ }

  try {
    const res = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`);
    if (!res.ok) return;
    const repos = (await res.json()).map(r => ({
      name: r.name,
      stargazers_count: r.stargazers_count,
      pushed_at: r.pushed_at
    }));
    paint(repos);
    try { sessionStorage.setItem(KEY, JSON.stringify(repos)); } catch { /* ignore */ }
  } catch { /* offline or rate limited, the static numbers stand */ }
})();
