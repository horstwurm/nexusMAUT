import { HomeIcon } from "@/components/home/HomeIcon";
import { InitialUpload } from "./InitialUpload";

/**
 * Admin → Data Management: two columns, «Initial Upload» (load the data for the first time) and
 * «Delta Upload» (load changes since the last upload). Initial Upload: `InitialUpload`; Delta follows.
 */
export function DataManagementAdmin() {
  const columns = [
    { id: "initial", title: "Initial Upload", text: "Erstbefüllung: die Daten einmalig vollständig laden." },
    { id: "delta", title: "Delta Upload", text: "Laufende Aktualisierung: nur die Änderungen seit dem letzten Upload laden." },
  ];
  return (
    <section className="card">
      <h2>Data Management</h2>
      <p className="small muted">Daten in nexusMAUT laden – erstmalig vollständig oder laufend als Änderungen.</p>
      <div className="data-columns">
        {columns.map((c) => (
          <section key={c.id} className="data-column" aria-labelledby={`data-${c.id}`}>
            <div className="row" style={{ gap: 8 }}>
              <HomeIcon name={c.id === "initial" ? "layers" : "refresh"} size={20} />
              <h3 id={`data-${c.id}`} style={{ margin: 0 }}>
                {c.title}
              </h3>
            </div>
            <p className="small muted">{c.text}</p>
            {c.id === "initial" ? (
              <InitialUpload />
            ) : (
              <p className="empty" style={{ margin: 0 }}>
                Noch keine Funktion.
              </p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
