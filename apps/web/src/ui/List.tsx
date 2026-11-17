import { type ReactNode, useId } from "react";
import { cx } from "../lib/cx.ts";
import { longDate } from "../lib/date.ts";
import { Icon } from "./Icon.tsx";
import { Surface } from "./Surface.tsx";

/** iOS grouped list pieces: an inset surface, rows with hairlines, a caption header and a footnote. */

export function Section({ title, footnote, children }: { title?: string; footnote?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {title && <h2 className="t-cap m-0 px-4">{title}</h2>}
      {children}
      {footnote && <p className="t-cap m-0 px-4">{footnote}</p>}
    </section>
  );
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Surface variant="inset" className={cx("flex flex-col", className)}>
      {children}
    </Surface>
  );
}

const Chevron = () => <Icon name="chevronRight" size={14} stroke={2.5} className="flex-none text-ink-3" />;

type RowButtonProps = {
  label: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  tone?: "plain" | "link";
};

/** A row that opens something: label left, current value and a chevron right. */
export function RowButton({ label, value, onClick, tone = "plain" }: RowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("row bg-transparent p-0 pr-4 text-left", tone === "link" && "justify-start text-action")}
    >
      <span className="t-body min-w-0 py-2">{label}</span>
      {tone === "plain" && (
        // A long value ("Lundi, Mercredi, Samedi, Dimanche") wraps instead of running over the label.
        <span className="t-body flex min-w-0 max-w-[55%] items-center gap-2 text-right text-ink-2">
          <span className="min-w-0">{value}</span>
          <Chevron />
        </span>
      )}
    </button>
  );
}

type SelectProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

/** A row whose value is picked with the native iOS wheel. */
export function RowSelect<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="row focus-within:rounded-row focus-within:outline-2 focus-within:outline-action">
      <label htmlFor={id} className="t-body">
        {label}
      </label>
      <span className="flex items-center gap-2 text-ink-2">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const picked = options.find((o) => o.value === e.target.value);
            if (picked) onChange(picked.value);
          }}
          className="min-h-11 appearance-none border-0 bg-transparent text-right text-ink outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Chevron />
      </span>
    </div>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "time" | "date" | "password";
  placeholder?: string;
  min?: string;
  inputMode?: "decimal" | "numeric";
  /** A login field ("username webauthn", "current-password"): no capital, no correction. */
  autoComplete?: string;
  /** The server's own limit, so a long title stops at the keyboard instead of failing on save. */
  maxLength?: number;
};

/** How a date or a time reads in the app ("lundi 16 novembre", "7:30"), whatever the native field shows. */
function shown(type: InputProps["type"], value: string): string | undefined {
  if (!value || (type !== "date" && type !== "time")) return undefined;
  return type === "date" ? longDate(value) : value.replace(/^0(\d)/, "$1");
}

/**
 * A row with an editable value on the right: name, time, date. 16 px so iOS never zooms in. A date or a time
 * shows the app's own wording, with the native field laid over it to open the iOS wheel.
 */
export function RowInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  inputMode,
  autoComplete,
  maxLength,
}: InputProps) {
  const id = useId();
  const text = shown(type, value);
  return (
    <div className="row relative focus-within:rounded-row focus-within:outline-2 focus-within:outline-action">
      <label htmlFor={id} className="t-body flex-none">
        {label}
      </label>
      {text && (
        <span aria-hidden="true" className="t-body pointer-events-none absolute right-4 text-ink">
          {text}
        </span>
      )}
      <input
        id={id}
        type={type}
        // The app writes "7:30"; a time field needs "07:30".
        value={type === "time" ? value.padStart(5, "0") : value}
        min={min}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize={autoComplete ? "none" : undefined}
        autoCorrect={autoComplete ? "off" : undefined}
        spellCheck={autoComplete ? false : undefined}
        onChange={(e) => onChange(type === "time" ? e.target.value.replace(/^0(\d)/, "$1") : e.target.value)}
        className={cx(
          "t-body min-h-11 min-w-0 flex-1 border-0 bg-transparent text-right text-ink outline-none",
          text && "opacity-0",
        )}
      />
    </div>
  );
}
