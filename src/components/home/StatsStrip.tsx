"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeStats } from "@/lib/server/home";

/** Counts from 0 to `to` once `run` is true (ease-out, ~1.4 s); at once without motion. */
function useCountUp(to: number, run: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1400;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      // the first frame's timestamp can lie just before `start`
      const t = duration ? Math.min(1, Math.max(0, (now - start) / duration)) : 1;
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, run]);
  return value;
}

function Counter({ to, run }: { to: number; run: boolean }) {
  return <>{useCountUp(to, run).toLocaleString("de-CH")}</>;
}

/** nexusMAUT in numbers – counting up when the strip comes into view. */
export function StatsStrip({ stats }: { stats: HomeStats }) {
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { threshold: 0.4 });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const items: { label: string; value: number }[] = [
    { label: "Kunden", value: stats.customers },
    { label: "Positionen", value: stats.positions },
    { label: "Transaktionen", value: stats.transactions },
    { label: "Kunden Selektionen", value: stats.rules },
    { label: "Journeys", value: stats.journeys },
    { label: "Aktive KundenJourneys", value: stats.activeRuns },
    { label: "Services", value: stats.services },
  ];
  return (
    <section ref={box} aria-label="nexusMAUT in Zahlen" className="hp-stats">
      <ul>
        {items.map((it) => (
          <li key={it.label}>
            <strong className="hp-num">
              <Counter to={it.value} run={visible} />
            </strong>
            <span className="hp-eyebrow">{it.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
