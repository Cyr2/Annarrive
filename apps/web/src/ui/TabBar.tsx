import { Icon, type IconName } from "./Icon.tsx";

export type Tab = { href: string; label: string; icon: IconName; preload?: () => void };

type Props = { tabs: Tab[]; active: number; onNavigate: (href: string) => void };

/**
 * Floating glass tab bar. The active pill slides to the new tab (transform only); the screens cross-fade.
 * Real links, so long-press and VoiceOver behave like links; the click is handed to the router.
 */
export function TabBar({ tabs, active, onNavigate }: Props) {
  const n = tabs.length;
  return (
    <nav
      aria-label="Navigation principale"
      className="glass-bar fixed inset-x-4 z-30 grid h-(--size-tabbar) gap-1 rounded-full p-1.5 [view-transition-name:tabbar]"
      style={{
        bottom: "max(var(--space-tabbar-bottom), env(safe-area-inset-bottom))",
        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
      }}
    >
      {active >= 0 && (
        <span
          aria-hidden="true"
          className="tab-pill absolute top-1.5 bottom-1.5 left-1.5 rounded-full bg-fill-hover"
          style={{
            // 6 px padding each side, 4 px between tabs: the same grid as the links.
            width: `calc((100% - 12px - ${n - 1} * 4px) / ${n})`,
            transform: `translateX(calc(${active} * (100% + 4px)))`,
          }}
        />
      )}
      {tabs.map((tab, index) => (
        <a
          key={tab.href}
          href={tab.href}
          aria-current={index === active ? "page" : undefined}
          onPointerDown={tab.preload}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            onNavigate(tab.href);
          }}
          className={`t-tab relative flex flex-col items-center justify-center gap-0.5 rounded-full select-none ${index === active ? "text-text" : "text-text-secondary"}`}
        >
          <Icon name={tab.icon} size={22} />
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
