/**
 * The showcase shell: a two-route app whose only job is to be a fixture host.
 *
 * `/` mounts every CSF story in every token mode; `/data-table` mounts the DataTable against
 * the generated MSW handlers. The theme `<select>` writes `document.documentElement.dataset.theme`,
 * which is the `[data-theme]` cascade RESEARCH.md §6.3 describes: it re-skins the page chrome and
 * anything that does not pin a mode (the data-table view), while the gallery sections pin their own
 * mode so all three stay visible at once.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { IsolatedStoryView } from './views/IsolatedStoryView.js';
import { InteractionView } from './views/InteractionView.js';
import { TOKEN_MODES, type TokenMode } from './story-registry.js';
import { Gallery } from './views/Gallery.js';
import { PositionsView } from './views/PositionsView.js';
import { DashboardView } from './views/DashboardView.js';

export const ROUTES = {
  dashboard: '/dashboard',
  gallery: '/',
  dataTable: '/data-table',
  story: '/story',
  interaction: '/interaction',
} as const;

const TITLES: Record<keyof typeof ROUTES, string> = {
  dashboard: '⚡ 研发工程驾驶舱',
  gallery: '🎨 组件展厅',
  dataTable: '📊 契约数据表',
  story: '🔍 独立用例',
  interaction: '🕹️ 交互演练',
};

/** The nav hrefs; the isolated route needs its story selector in the query. */
const HREFS: Record<keyof typeof ROUTES, string> = {
  dashboard: ROUTES.dashboard,
  gallery: ROUTES.gallery,
  dataTable: ROUTES.dataTable,
  story: `${ROUTES.story}?story=ui-dialog--open`,
  interaction: ROUTES.interaction,
};

function routeOf(pathname: string): keyof typeof ROUTES {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === ROUTES.dashboard) {
    return 'dashboard';
  }
  if (trimmed === ROUTES.dataTable) {
    return 'dataTable';
  }
  if (trimmed === ROUTES.interaction) {
    return 'interaction';
  }
  return trimmed === ROUTES.story ? 'story' : 'gallery';
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPopState = (): void => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return pathname;
}

const MODE_LABELS: Record<TokenMode, string> = {
  light: '默认浅色 (Light)',
  dark: '驾驶舱暗色 (Dark)',
  'high-contrast': '高对比模式 (High Contrast)',
};

function ThemeControl(props: { readonly theme: TokenMode; readonly onChange: (mode: TokenMode) => void }): ReactNode {
  return (
    <div className="showcase__theme">
      <label className="showcase__theme-label" htmlFor="showcase-theme">
        主题切换
      </label>
      <select
        className="showcase__select"
        id="showcase-theme"
        data-role="theme-select"
        value={props.theme}
        onChange={(event) => props.onChange(event.currentTarget.value as TokenMode)}
      >
        {TOKEN_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    </div>
  );
}

function Navigation(props: { readonly route: keyof typeof ROUTES }): ReactNode {
  const links = (Object.keys(ROUTES) as readonly (keyof typeof ROUTES)[]).map((key) => [key, HREFS[key]] as const);

  return (
    <nav className="showcase__nav" aria-label="Showcase views">
      {links.map(([key, href]) => (
        <a
          key={key}
          className="showcase__nav-link"
          href={href}
          aria-current={props.route === key ? 'page' : undefined}
          data-role={`nav-${key}`}
        >
          {TITLES[key]}
        </a>
      ))}
    </nav>
  );
}

export function App(): ReactNode {
  const pathname = usePathname();
  const route = routeOf(pathname);
  const [theme, setTheme] = useState<TokenMode>('light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="showcase" data-role="showcase-root">
      <header className="showcase__header">
        <h1 className="showcase__title">DesignHarness 研发工程底座</h1>
        <p className="showcase__subtitle">
          Token 驱动、意图对齐与契约验证的设计系统工程底座。集成研发工程驾驶舱、组件展厅与 WCAG 2.2 AA 全自动化门禁。
        </p>
        <Navigation route={route} />
        <ThemeControl theme={theme} onChange={setTheme} />
      </header>

      <main className="showcase__main">
        {route === 'dashboard' ? (
          <DashboardView />
        ) : route === 'dataTable' ? (
          <PositionsView />
        ) : route === 'story' ? (
          <IsolatedStoryView />
        ) : route === 'interaction' ? (
          <InteractionView />
        ) : (
          <Gallery />
        )}
      </main>
    </div>
  );
}
