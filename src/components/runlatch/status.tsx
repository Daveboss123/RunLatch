import { StatusIcon } from "./icons";

export function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "bad" | "pending" | "neutral" }) {
  return <span className={`status status-${tone}`}><StatusIcon state={tone} />{children}</span>;
}
