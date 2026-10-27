import { cn } from "../../lib/cn";

interface AvatarProps {
  name: string;
  color?: string; // label-* role name
  size?: "sm" | "md";
}

const colorClass: Record<string, string> = {
  gray: "bg-label-gray", red: "bg-label-red", orange: "bg-label-orange",
  amber: "bg-label-amber", green: "bg-label-green", teal: "bg-label-teal",
  blue: "bg-label-blue", purple: "bg-label-purple", pink: "bg-label-pink",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/** Avatar with initials. aria-label carries the person's name for screen readers. */
export function Avatar({ name, color = "blue", size = "md" }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex items-center justify-center rounded-pill font-semibold text-on-accent",
        colorClass[color] ?? colorClass.blue,
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
      )}
    >
      {initials(name)}
    </span>
  );
}
