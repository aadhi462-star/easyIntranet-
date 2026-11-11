import { lazy, Suspense, Component } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './lib/store.jsx';
import { MODULES, EXTRA_ROUTES } from './lib/modules.js';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Invite from './pages/Invite.jsx';
import Signup from './pages/Signup.jsx';
import Explore from './pages/Explore.jsx';
import { ConfirmEmail, ResetPassword, VerifyEmail } from './components/auth/TokenPages.jsx';
import AuthSync from './components/auth/AuthSync.jsx';

// Pages load lazily by file name, so each module ships as its own chunk.
const files = import.meta.glob(['./pages/*.jsx', '!./pages/{Landing,Login,Invite,Signup,Explore}.jsx']);
const pageCache = {};
function page(name) {
  const loader = files[`./pages/${name}.jsx`];
  if (!loader) return () => <Missing name={name} />;
  return (pageCache[name] ??= lazy(() => loader().catch(reloadForNewBuild)));
}

// After a new build, a tab opened earlier still asks for the old hashed chunk names, which
// are gone. Reload once to pick up the new build; the session flag stops a reload loop if
// the chunk is missing for some other reason (then the error shows as usual).
const RELOAD_FLAG = 'alumnizone:chunk-reload';
function claimReload() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch { /* storage blocked: still try once */ }
  return true;
}
function reloadForNewBuild(err) {
  if (!claimReload()) throw err;
  window.location.reload();
  return new Promise(() => {}); // keep the spinner up until the reload lands
}
// Vite raises this when a chunk or its preloaded CSS fails to load. preventDefault() makes
// Vite resolve the import as empty, so only do it when we're actually reloading.
window.addEventListener('vite:preloadError', (e) => { if (claimReload()) { e.preventDefault(); window.location.reload(); } });
// A page that loaded cleanly means the build is current again.
window.addEventListener('load', () => { setTimeout(() => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ } }, 5000); });

const Welcome = page('Welcome');

function Missing({ name }) {
  return <div className="glass p-8 text-slate-300">The <b>{name}</b> module isn’t available yet.</div>;
}

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    const { error } = this.state;
    if (error && /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error.message)) {
      return (
        <div className="glass p-8">
          <p className="font-semibold">CommunityOne was updated.</p>
          <p className="mt-1 text-sm text-slate-400">This page is from the new version. Reload to open it.</p>
          <button className="btn btn-primary mt-4" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    if (error) return <div className="glass p-8"><p className="font-semibold">Something went wrong on this page.</p><pre className="mt-3 whitespace-pre-wrap text-xs text-rose-300">{String(error.message)}</pre></div>;
    return this.props.children;
  }
}

// Background behaviour (scheduled posts, workflows, schedulers, reminders, dynamic
// membership). Mounted at app level, not inside the signed-in layout, so events that happen
// while signed out (a new signup) still reach them. Add one by creating
// src/lib/runners/<name>.jsx with a default-exported component.
const runners = Object.values(import.meta.glob('./lib/runners/*.jsx', { eager: true })).map((m) => m.default).filter(Boolean);

function Protected({ children }) {
  const { me, state } = useStore();
  const loc = useLocation();
  // Keep where the visitor was heading so sign-in can bring them back (prompt §5).
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  // A new member does the welcome steps first, then carries on to where they were going.
  if (state.session?.onboarded === false) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

export default function App() {
  const { me, state } = useStore();
  // Hidden modules lose their routes too (admins keep them so they can preview before showing).
  const hidden = me?.admin ? [] : (state.settings.hiddenModules || []);
  const routes = [
    ...MODULES.filter((m) => !hidden.includes(m.id)).flatMap((m) => [m.path, ...(m.routes || [])].map((path) => ({ path, page: m.page }))),
    ...EXTRA_ROUTES,
  ];
  return (
    <HashRouter>
      <AuthSync />
      {runners.map((R, i) => <R key={i} />)}
      <Routes>
        <Route path="/" element={me ? <Navigate to={state.settings.landing || '/dashboard'} replace /> : <Landing />} />
        <Route path="/login" element={me ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/signup" element={me ? <Navigate to="/dashboard" replace /> : <Signup />} />
        <Route path="/explore" element={<Explore />} />
        {['About', 'Help', 'Privacy', 'Terms', 'Contact'].map((name) => {
          const Page = page(name);
          return <Route key={name} path={`/${name.toLowerCase()}`} element={<Suspense fallback={null}><Page /></Suspense>} />;
        })}
        <Route path="/welcome" element={me ? <Suspense fallback={null}><Welcome /></Suspense> : <Navigate to="/login" replace />} />
        <Route path="/invite/:code" element={<Invite />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/confirm-email" element={<ConfirmEmail />} />
        <Route element={<Protected><Layout /></Protected>}>
          {routes.map(({ path, page: name }) => {
            const Page = page(name);
            return <Route key={path} path={path} element={<Boundary key={path}><Suspense fallback={<div className="glass h-40 animate-pulse" />}><Page /></Suspense></Boundary>} />;
          })}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
