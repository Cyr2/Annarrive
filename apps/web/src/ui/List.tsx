import { type ReactNode, useId } from "react";
import { cx } from "../lib/cx.ts";
import { Icon } from "./Icon.tsx";

/** iOS grouped list pieces: a white rounded group, rows with hairlines, a caption header and a footnote. */

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
  return <div className={cx("group", className)}>{children}</div>;
}

const Chevron = () => <Icon name="chevronRight" size={14} stroke={2.5} className="flex-none text-text-faint" />;

type RowButtonProps = {
  label: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  tall?: boolean;
  tone?: "plain" | "link";
};

/** A row that opens something: label left, current value and a chevron right. */
export function RowButton({ label, value, onClick, tall = false, tone = "plain" }: RowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "row border-0 bg-transparent p-0 pr-4 text-left",
        tall && "min-h-16",
        tone === "link" && "justify-start text-link",
      )}
    >
      <span className="t-body">{label}</span>
      {tone === "plain" && (
        <span className="t-body flex items-center gap-2 text-text-secondary">
          {value}
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
    <div className="row">
      <label htmlFor={id} className="t-body">
        {label}
      </label>
      <span className="flex items-center gap-2 text-text-secondary">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const picked = options.find((o) => o.value === e.target.value);
            if (picked) onChange(picked.value);
          }}
          className="min-h-11 appearance-none border-0 bg-transparent text-right text-text-secondary"
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
  type?: "text" | "time" | "date";
  placeholder?: string;
  min?: string;
};

/** A row with an editable value on the right: name, time, date. 16 px so iOS never zooms in. */
export function RowInput({ label, value, onChange, type = "text", placeholder, min }: InputProps) {
  const id = useId();
  return (
    <div className="row">
      <label htmlFor={id} className="t-body flex-none">
        {label}
      </label>
      <input
        id={id}
        type={type}
        // The app writes "7:30"; a time field needs "07:30".
        value={type === "time" ? value.padStart(5, "0") : value}
        min={min}
        placeholder={placeholder}
        onChange={(e) => onChange(type === "time" ? e.target.value.replace(/^0(\d)/, "$1") : e.target.value)}
        className="t-body min-h-11 min-w-0 flex-1 border-0 bg-transparent text-right text-text-secondary"
      />
    </div>
  );
}
