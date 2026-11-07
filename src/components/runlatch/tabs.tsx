"use client";

export function Tabs({ id, label, options, active, onChange, children }: {
  id: string; label: string; options: readonly { value: string; label: string }[];
  active: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return <><div className="tabs" role="tablist" aria-label={label}>{options.map((option, index) => <button key={option.value} id={`${id}-tab-${option.value}`} role="tab" aria-selected={active === option.value} aria-controls={`${id}-panel`} tabIndex={active === option.value ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={event => {
    const next = event.key === "ArrowRight" ? (index + 1) % options.length : event.key === "ArrowLeft" ? (index + options.length - 1) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
    if (next !== null) { event.preventDefault(); onChange(options[next].value); document.getElementById(`${id}-tab-${options[next].value}`)?.focus(); }
  }}>{option.label}</button>)}</div><div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0}>{children}</div></>;
}
