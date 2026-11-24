import { formatDate } from "@/lib/client";
import { MANUAL_SOURCE_NAME, UPLOAD_SOURCE_LABELS, type UploadSource } from "@/lib/uploads";

// Columns «Quelle» and «Quelldatum» of the customer, position and transaction tables: where a record
// comes from (upload in Admin → Data Management: its unique name and format, or entered by hand) and when.

export function SourceHeaders() {
  return (
    <>
      <th>Quelle</th>
      <th>Quelldatum</th>
    </>
  );
}

export function SourceCells({ source, name, date }: { source: UploadSource | null; name: string | null; date: string | null }) {
  return (
    <>
      <td className="small" style={{ whiteSpace: "nowrap" }}>
        {source ? (
          <>
            {name ?? "Upload"} <span className="badge">{UPLOAD_SOURCE_LABELS[source]}</span>
          </>
        ) : (
          // entered by hand: «Manuell» (records from before 2026-11-24 have no name)
          <span className="muted">{name ?? MANUAL_SOURCE_NAME}</span>
        )}
      </td>
      <td className="small" style={{ whiteSpace: "nowrap" }}>
        {date ? formatDate(date, true) : <span className="muted">–</span>}
      </td>
    </>
  );
}
