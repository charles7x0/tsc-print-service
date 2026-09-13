import type { ViewId } from '../types';

interface NavItem {
  id: ViewId;
  label: string;
  /** Short hint shown to screen readers / as a title. */
  hint: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'print', label: 'Print', hint: 'Pick a template and print' },
  { id: 'templates', label: 'Templates', hint: 'Create and edit TSPL templates' },
  { id: 'custom', label: 'Custom / Raw', hint: 'Build a custom label or send raw TSPL' },
  { id: 'settings', label: 'Settings', hint: 'Printer connection and label defaults' },
];

interface NavBarProps {
  active: ViewId;
  onSelect: (view: ViewId) => void;
}

/**
 * Primary view switcher. Renders as an ARIA tablist so the whole app remains a
 * single page while separating the operator flow (Print) from the authoring
 * and configuration surfaces.
 */
export function NavBar({ active, onSelect }: NavBarProps): JSX.Element {
  return (
    <nav className="app-nav" aria-label="Primary">
      <ul className="app-nav__list" role="tablist">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id} role="presentation">
              <button
                type="button"
                role="tab"
                id={`nav-tab-${item.id}`}
                aria-selected={isActive}
                aria-controls={`view-${item.id}`}
                className={`app-nav__tab${isActive ? ' app-nav__tab--active' : ''}`}
                title={item.hint}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
