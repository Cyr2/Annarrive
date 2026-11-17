/**
 * The control layer: our thin wrapper over glisse (Liquid Glass). The app imports controls from here, never
 * from glisse, so defaults and fixes live in one place (styles in styles/controls.css).
 *
 * Glass is for what you touch: buttons, chips, segmented controls, fields, switches, sliders, the tab bar.
 * Content (cards, lists, widgets) sits on `Surface`. glisse is patched (patches/glisse@0.6.0.patch) not to bend
 * the backdrop on phones: Chromium draws that filter on the CPU every frame. Phones keep the frost and the rim.
 */
import {
  Button as GlisseButton,
  Input as GlisseInput,
  SegmentedControl as GlisseSegmented,
  Slider as GlisseSlider,
  Switch as GlisseSwitch,
  TabBar as GlisseTabBar,
} from "glisse";
import { type ButtonHTMLAttributes, type ReactNode, type Ref, useEffect, useRef } from "react";
import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

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
    <GlisseButton
      {...rest}
      variant={variant === "filled" ? "filled" : "glass"}
      icon={icon && <Icon name={icon} size={size === "regular" ? 20 : 24} stroke={2.25} />}
      data-size={size}
      data-tone={shown === "default" ? undefined : shown}
      data-tinted={variant === "tinted" ? "" : undefined}
      className={cx("ui-button", className)}
    >
      {children}
    </GlisseButton>
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
    <GlisseButton
      {...rest}
      aria-pressed={selected}
      data-tone={tone}
      icon={shown && <Icon name={shown} size={16} stroke={2.5} />}
      className={cx("ui-chip", className)}
    >
      {children}
    </GlisseButton>
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
  return (
    <div className="ui-segmented-box">
      <GlisseSegmented
        aria-label={label}
        items={items}
        value={value ?? null}
        onValueChange={(next) => {
          const picked = items.find((item) => item.value === next);
          if (picked) onChange(picked.value);
        }}
        className="ui-segmented"
      />
    </div>
  );
}

type SwitchProps = { checked: boolean; onChange: (checked: boolean) => void; labelledBy: string; disabled?: boolean };

/** iOS switch: its thumb lifts into a lens while held. */
export function Switch({ checked, onChange, labelledBy, disabled }: SwitchProps) {
  return (
    <GlisseSwitch
      checked={checked}
      onCheckedChange={onChange}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className="ui-switch"
    />
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
  return (
    <GlisseSlider
      id={id}
      value={value}
      onValueChange={onChange}
      min={min}
      max={max}
      step={1}
      aria-valuetext={valueText}
      className="ui-slider"
    />
  );
}

type InputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
};

/** A free text field in glass (Reggie's composer, "Dis-le à Reggie"). Rows of a form use `RowInput` instead. */
export function Input({ id, value, onChange, placeholder, className }: InputProps) {
  return (
    <GlisseInput
      id={id}
      type="text"
      enterKeyHint="send"
      autoComplete="off"
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      className={cx("ui-input", className)}
    />
  );
}

export type Tab = { href: string; label: string; icon: IconName; preload?: () => void };

type TabBarProps = { tabs: Tab[]; active: string | null; onNavigate: (href: string) => void };

/** iOS 26's floating tab bar. Real links (long-press, VoiceOver); a plain click is handed to the router. */
export function TabBar({ tabs, active, onNavigate }: TabBarProps) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ tabs, onNavigate });
  latest.current = { tabs, onNavigate };

  // glisse renders the links: their clicks are caught here, on the way up.
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

  return (
    <div
      ref={box}
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{ bottom: "max(var(--space-tabbar-bottom), env(safe-area-inset-bottom))" }}
    >
      <GlisseTabBar
        aria-label="Navigation principale"
        items={tabs.map((tab) => ({
          value: tab.href,
          href: tab.href,
          label: tab.label,
          icon: <Icon name={tab.icon} />,
        }))}
        value={active}
        className="ui-tab-bar pointer-events-auto"
      />
    </div>
  );
}
