/**
 * The control layer: our thin wrapper over glisse (Liquid Glass). The app imports controls from here, never
 * from glisse, so defaults and fixes live in one place (styles in styles/controls.css).
 *
 * Glass is for what you touch: buttons, chips, segmented controls, fields, switches, sliders, the tab bar.
 * Content (cards, lists, widgets) sits on `Surface`. glisse is patched (patches/glisse@0.6.0.patch) not to bend
 * the backdrop on phones: Chromium draws that filter on the CPU every frame. Phones keep the frost and the rim.
 *
 * glisse stays off the first screen's path (a phone's first seconds): buttons and the tab bar first render
 * glisse's own markup, drawn by its stylesheet (imported in app.css), and become glisse once the first gesture
 * ends. Fields, switches, sliders and segmented controls only appear later, in screens loaded on demand.
 */
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  lazy,
  type ReactNode,
  type Ref,
  type RefObject,
  Suspense,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

/** glisse once its file is in: a control shown for the first time renders at once instead of suspending. */
let ready: typeof import("glisse") | undefined;
const loadGlisse = () =>
  import("glisse").then((module) => {
    ready = module;
    return module;
  });
let glisse: typeof import("glisse") | undefined;
const waiting = new Set<() => void>();
const GESTURE_END = ["pointerup", "pointercancel"] as const;

// After the gesture, never during it: a control swapped under the finger would lose its click. A keyboard
// never swaps, so a focused control stays where it is.
function upgrade() {
  for (const type of GESTURE_END) removeEventListener(type, upgrade, true);
  setTimeout(() => {
    void loadGlisse().then((module) => {
      glisse = module;
      for (const notify of waiting) notify();
    });
  });
}
if (typeof window !== "undefined") for (const type of GESTURE_END) addEventListener(type, upgrade, true);

/**
 * At idle after the first screen: glisse's file is in before the first gesture, so the swap after it is
 * immediate. The swap itself still waits for that gesture: done at idle, it drew the rims during the launch.
 */
export function preloadControls() {
  loadGlisse().catch(() => undefined);
}

function subscribe(notify: () => void) {
  waiting.add(notify);
  return () => {
    waiting.delete(notify);
  };
}

const useGlisse = () => useSyncExternalStore(subscribe, () => glisse);

type GlassButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon?: ReactNode;
  variant?: "filled" | "glass";
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

/** glisse's Button once loaded; until then its exact markup, so nothing moves when it arrives. */
function GlassButton({ icon, variant = "glass", className, children, type = "button", ...rest }: GlassButtonProps) {
  const loaded = useGlisse();
  if (loaded)
    return (
      <loaded.Button {...rest} type={type} variant={variant} icon={icon} className={className}>
        {children}
      </loaded.Button>
    );
  return (
    <button
      {...rest}
      type={type}
      className={cx("lg-glass lg-button", className)}
      data-icon={icon == null ? undefined : children == null ? "only" : ""}
      data-variant={variant === "glass" ? undefined : variant}
    >
      {icon}
      {children}
    </button>
  );
}

// A lazy component suspends on its first render even when its file is in: a sheet then grew under the finger
// as it rose (Modifier l'objectif). Once glisse is in, its components are used directly.
const LazySegmented = lazy(() => loadGlisse().then((module) => ({ default: module.SegmentedControl })));
const LazySwitch = lazy(() => loadGlisse().then((module) => ({ default: module.Switch })));
const LazySlider = lazy(() => loadGlisse().then((module) => ({ default: module.Slider })));
const LazyInput = lazy(() => loadGlisse().then((module) => ({ default: module.Input })));

type Tone = "default" | "action" | "reggie" | "danger";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** `filled`: the one main action of a view. `tinted`: a secondary action in its tone. `glass`: everything else. */
  variant?: "filled" | "tinted" | "glass";
  /** `regular` 44 px, `large` 50 px for the main action of a sheet or a screen, `round` the 60 px actions of Aujourd'hui. */
  size?: "regular" | "large" | "round";
  /** What the color means: action (blue), Reggie (green), danger (destroys). A filled button defaults to action. */
  tone?: Tone;
  icon?: IconName;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = "glass", size = "regular", tone, icon, className, children, ...rest }: ButtonProps) {
  const shown = tone ?? (variant === "glass" ? "default" : "action");
  return (
    <GlassButton
      {...rest}
      variant={variant === "filled" ? "filled" : "glass"}
      icon={icon && <Icon name={icon} size={size === "regular" ? 20 : 24} stroke={2.25} />}
      data-size={size}
      data-tone={shown === "default" ? undefined : shown}
      data-tinted={variant === "tinted" ? "" : undefined}
      className={cx("ui-button", className)}
    >
      {children}
    </GlassButton>
  );
}

/** A round glass button with only an icon. The label is required: it is what VoiceOver reads. */
export function IconButton({
  label,
  ...rest
}: Omit<ButtonProps, "children" | "icon"> & { icon: IconName; label: string }) {
  return <Button {...rest} aria-label={label} />;
}

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  icon?: IconName;
  /** A choice: sets aria-pressed and draws the ring and the check. Left out, the chip is a plain shortcut. */
  selected?: boolean;
  /** Reggie's replies select in his green. */
  tone?: "action" | "reggie";
};

/** A 44 px glass pill: a choice among a few (days, zones, Reggie's replies) or a shortcut. */
export function Chip({ children, icon, selected, tone = "action", className, ...rest }: ChipProps) {
  const shown = selected ? "check" : icon;
  return (
    <GlassButton
      {...rest}
      aria-pressed={selected}
      data-tone={tone}
      icon={shown && <Icon name={shown} size={16} stroke={2.5} />}
      className={cx("ui-chip", className)}
    >
      {children}
    </GlassButton>
  );
}

type SegmentedProps<T extends string> = {
  items: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** What VoiceOver reads before the choices. */
  label: string;
};

/** iOS segmented control, 2 to 4 short exclusive values. It fills the width of its container. */
export function SegmentedControl<T extends string>({ items, value, onChange, label }: SegmentedProps<T>) {
  const Segmented = ready?.SegmentedControl ?? LazySegmented;
  return (
    <div className="ui-segmented-box">
      <Suspense fallback={null}>
        <Segmented
          aria-label={label}
          items={items}
          value={value ?? null}
          onValueChange={(next) => {
            const picked = items.find((item) => item.value === next);
            if (picked) onChange(picked.value);
          }}
          className="ui-segmented"
        />
      </Suspense>
    </div>
  );
}

type SwitchProps = { checked: boolean; onChange: (checked: boolean) => void; labelledBy: string; disabled?: boolean };

/** iOS switch: its thumb lifts into a lens while held. */
export function Switch({ checked, onChange, labelledBy, disabled }: SwitchProps) {
  const GlassSwitch = ready?.Switch ?? LazySwitch;
  return (
    <Suspense fallback={null}>
      <GlassSwitch
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby={labelledBy}
        disabled={disabled}
        className="ui-switch"
      />
    </Suspense>
  );
}

type SliderProps = {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  valueText: string;
};

/** Slider on a native range input, so the keyboard and VoiceOver work. Its fill is ink: a level, not an action. */
export function Slider({ id, value, onChange, min, max, valueText }: SliderProps) {
  const GlassSlider = ready?.Slider ?? LazySlider;
  return (
    <Suspense fallback={null}>
      <GlassSlider
        id={id}
        value={value}
        onValueChange={onChange}
        min={min}
        max={max}
        step={1}
        aria-valuetext={valueText}
        className="ui-slider"
      />
    </Suspense>
  );
}

type InputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  maxLength?: number;
  /** A button drawn inside the field, at its trailing end: the send button. */
  action?: ReactNode;
};

/** A free text field in glass (Reggie's composer, "Dis-le à Reggie"). Rows of a form use `RowInput` instead. */
export function Input({ id, value, onChange, placeholder, className, action, maxLength }: InputProps) {
  const GlassInput = ready?.Input ?? LazyInput;
  return (
    <Suspense fallback={null}>
      <div className={cx("ui-field", className)}>
        <GlassInput
          id={id}
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          className="ui-input"
        />
        {action && <span className="ui-field-action">{action}</span>}
      </div>
    </Suspense>
  );
}

export type Tab = { href: string; label: string; icon: IconName; preload?: () => void };

type TabBarProps = { tabs: Tab[]; active: string | null; onNavigate: (href: string) => void };

/** Taller than a browser toolbar: a gap this size between the page's bottom and what is visible is the keyboard. */
const TOOLBAR_MAX = 120;

/**
 * Android Chrome lets a fixed bar sink under the visible bottom while its toolbar comes back over a scroll up:
 * the bar is lifted onto the visible bottom. Not over the keyboard (the bar stays under it) nor while zoomed.
 */
function useOnVisibleBottom(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = box.current;
    if (!viewport || !element) return;
    const place = () => {
      const sunk = Math.round(innerHeight - viewport.height - viewport.offsetTop);
      const lift = sunk > 0 && sunk < TOOLBAR_MAX && viewport.scale === 1;
      element.style.transform = lift ? `translateY(${-sunk}px)` : "";
    };
    place();
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    return () => {
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
    };
  }, [box]);
}

/** iOS 26's floating tab bar. Real links (long-press, VoiceOver); a plain click is handed to the router. */
export function TabBar({ tabs, active, onNavigate }: TabBarProps) {
  const loaded = useGlisse();
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ tabs, onNavigate });
  latest.current = { tabs, onNavigate };
  useOnVisibleBottom(box);

  // The links' clicks are caught here, on the way up, whoever renders them.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const hrefOf = ({ target }: Event) =>
      target instanceof Element ? target.closest("a")?.getAttribute("href") : undefined;
    const onPointerDown = (event: Event) => latest.current.tabs.find((tab) => tab.href === hrefOf(event))?.preload?.();
    const onClick = (event: MouseEvent) => {
      const href = hrefOf(event);
      if (!href || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      latest.current.onNavigate(href);
    };
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("click", onClick);
    };
  }, []);

  const items = tabs.map((tab) => ({
    value: tab.href,
    href: tab.href,
    label: tab.label,
    icon: <Icon name={tab.icon} />,
  }));
  return (
    <div
      ref={box}
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{ bottom: "max(var(--space-tabbar-bottom), env(safe-area-inset-bottom))" }}
    >
      {loaded ? (
        <loaded.TabBar
          aria-label="Navigation principale"
          items={items}
          value={active}
          className="ui-tab-bar pointer-events-auto"
        />
      ) : (
        <StillTabBar items={items} active={active} />
      )}
    </div>
  );
}

type TabItem = { href: string; label: string; icon: ReactNode };

function TabFace({ icon, label }: TabItem) {
  return (
    <>
      <span className="lg-tab-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="lg-tab-label">{label}</span>
    </>
  );
}

/** glisse's tab bar markup at rest (glass, selection, tinted labels), until glisse takes over. */
function StillTabBar({ items, active }: { items: TabItem[]; active: string | null }) {
  const selected = items.findIndex((item) => item.href === active);
  const vars: CSSProperties & Record<`--${string}`, number> = {
    "--lg-index": Math.max(selected, 0),
    "--lg-tabs": items.length,
  };
  return (
    // glisse's own bar is a div with this role: the same element before and after the swap, one landmark.
    // biome-ignore lint/a11y/useSemanticElements: matches glisse's markup.
    <div
      role="navigation"
      aria-label="Navigation principale"
      data-icons=""
      className="lg-tab-bar ui-tab-bar pointer-events-auto"
      style={vars}
    >
      <span className="lg-glass lg-tab-bar-glass" aria-hidden="true" />
      <span className="lg-tab-labels" role="none">
        {items.map((item, index) => (
          <a
            key={item.href}
            href={item.href}
            className="lg-tab"
            data-selected={index === selected ? "" : undefined}
            aria-current={index === selected ? "page" : undefined}
            draggable={false}
          >
            <span className="lg-tab-face">
              <TabFace {...item} />
            </span>
          </a>
        ))}
      </span>
      <span className="lg-tab-tint" aria-hidden="true">
        <span className="lg-tab-row">
          {items.map((item) => (
            <span key={item.href} className="lg-tab-copy">
              <TabFace {...item} />
            </span>
          ))}
        </span>
      </span>
      <span className="lg-glass lg-tab-lens" aria-hidden="true" />
    </div>
  );
}
