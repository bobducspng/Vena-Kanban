import { useEffect, useState } from "react";
import { Input } from "./Input";
import { Select } from "./Select";

type Unit = "minutes" | "hours" | "days";

/** A duration in minutes, typed as number + unit. `dayMinutes` = how long a "dia" is
 *  (1440 calendar minutes, or the workday length when counting business hours).
 *  Saves on blur / unit change; empty = no limit (null). */
export function DurationInput({ id, value, onChange, dayMinutes = 1440, dayLabel = "dias" }: {
  id?: string; value: number | null | undefined; onChange: (minutes: number | null) => void; dayMinutes?: number; dayLabel?: string;
}) {
  const pick = (m: number): Unit => (m % dayMinutes === 0 ? "days" : m % 60 === 0 ? "hours" : "minutes");
  const per = (u: Unit) => (u === "days" ? dayMinutes : u === "hours" ? 60 : 1);
  const [unit, setUnit] = useState<Unit>(value ? pick(value) : "hours");
  const [text, setText] = useState(value ? String(value / per(value ? pick(value) : "hours")) : "");
  useEffect(() => {
    if (!value) { setText(""); return; }
    const u = pick(value);
    setUnit(u);
    setText(String(value / per(u)));
  }, [value, dayMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (t: string, u: Unit) => {
    const n = Number(t.replace(",", "."));
    const minutes = t.trim() === "" || !(n > 0) ? null : Math.round(n * per(u));
    if (minutes !== (value ?? null)) onChange(minutes);
  };
  return (
    <div className="flex gap-2">
      <Input id={id} inputMode="decimal" className="w-24" placeholder="sem limite" value={text}
        onChange={(e) => setText(e.target.value)} onBlur={() => commit(text, unit)} />
      <div className="w-36">
        <Select aria-label="Unidade" value={unit} onValueChange={(u) => { setUnit(u as Unit); commit(text, u as Unit); }}
          options={[{ value: "minutes", label: "minutos" }, { value: "hours", label: "horas" }, { value: "days", label: dayLabel }]} />
      </div>
    </div>
  );
}
