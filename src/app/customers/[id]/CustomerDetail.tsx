"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/Notice";
import { api, errorText, formatDate } from "@/lib/client";
import { formatDay } from "@/lib/customers";
import { labelOf } from "@/lib/domains";
import { formatValue, type AttributeDef } from "@/lib/positions";
import { UPLOAD_SOURCE_LABELS } from "@/lib/uploads";
import type { Customer, CustomerComPref, CustomerPosition, CustomerProduct, DomainValue } from "@/lib/types";
import { Positions } from "./Positions";

type Props = {
  isAdmin: boolean;
  customer: Customer;
  initialProducts: CustomerProduct[];
  initialComPrefs: CustomerComPref[];
  productTypes: DomainValue[];
  comPrefTypes: DomainValue[];
  /** product type code → its position attributes */
  attributesByType: Record<string, AttributeDef[]>;
  /** product type code → its transaction attributes */
  trxAttributesByType: Record<string, AttributeDef[]>;
  /** attributes every customer can have */
  customerAttributes: AttributeDef[];
  initialPositions: CustomerPosition[];
};

/** A customer with its relations: products & services, positions, communication preferences. */
export function CustomerDetail({
  isAdmin,
  customer,
  initialProducts,
  initialComPrefs,
  productTypes,
  comPrefTypes,
  attributesByType,
  trxAttributesByType,
  customerAttributes,
  initialPositions,
}: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [comPrefs, setComPrefs] = useState(initialComPrefs);
  const [positions, setPositions] = useState(initialPositions);
  const [productDraft, setProductDraft] = useState<Partial<CustomerProduct> | null>(null);
  const [comPrefDraft, setComPrefDraft] = useState<Partial<CustomerComPref> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const base = `/api/customers/${customer.id}`;
  // any «Service» attribute on customer, positions or transactions?
  const hasServiceAttrs = [...customerAttributes, ...Object.values(attributesByType).flat(), ...Object.values(trxAttributesByType).flat()].some((d) => d.service);

  async function refreshServices() {
    setRefreshing(true);
    setError(null);
    setInfo(null);
    try {
      const r = await api<{ records: number; values: number; errors: number; messages: string[] }>(`${base}/refresh-services`, { method: "POST" });
      const text = `${r.values} Service-Werte geholt.`;
      if (r.errors) setError(`${text} ${r.errors} Fehler: ${r.messages.join(" · ")}`);
      else setInfo(text);
      setPositions(await api<CustomerPosition[]>(`${base}/positions`));
      router.refresh(); // customer attributes in the header
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRefreshing(false);
    }
  }

  const reloadProducts = async () => setProducts(await api<CustomerProduct[]>(`${base}/products`));
  const reloadComPrefs = async () => setComPrefs(await api<CustomerComPref[]>(`${base}/communication-preferences`));

  async function remove(url: string, what: string, reload: () => Promise<void>) {
    if (!window.confirm(`${what} löschen?`)) return;
    setError(null);
    try {
      await api(url, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const noValues = (values: DomainValue[]) =>
    !values.some((v) => v.active) && (
      <Notice kind="warn">
        Noch keine aktiven Werte in dieser Werteliste.{" "}
        {isAdmin ? <Link href="/admin">In der Administration anlegen</Link> : "Bitte eine Administratorin oder einen Administrator fragen."}
      </Notice>
    );

  return (
    <>
      <p className="small">
        <Link href="/customers">← Kunden</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>
            {customer.name} {customer.lastname}
          </h1>
          <p className="muted small" style={{ margin: 0 }}>
            Geboren {formatDay(customer.dateOfBirth)} · ID <span className="mono">{customer.id}</span>
            {customer.uploadSource ? (
              <>
                {" "}
                · aus Upload <strong>{customer.uploadName ?? UPLOAD_SOURCE_LABELS[customer.uploadSource]}</strong> ({UPLOAD_SOURCE_LABELS[customer.uploadSource]})
                {customer.uploadDate && ` vom ${formatDate(customer.uploadDate, true)}`}
              </>
            ) : (
              customer.uploadDate && ` · ${customer.uploadName ?? "Manuell"} erfasst am ${formatDate(customer.uploadDate, true)}`
            )}
          </p>
          {customerAttributes.some((a) => customer.attributes[a.id] !== undefined) && (
            <div className="tags" style={{ marginTop: 8 }}>
              {customerAttributes
                .filter((a) => customer.attributes[a.id] !== undefined)
                .map((a) => (
                  <span key={a.id} className="badge">
                    {a.attribute}: <strong>{formatValue(a, customer.attributes[a.id])}</strong>
                    {a.service && <span className="muted"> (Service)</span>}
                  </span>
                ))}
            </div>
          )}
        </div>
        {hasServiceAttrs && (
          <button className="btn" onClick={refreshServices} disabled={refreshing} title="Alle Service-Attribute des Kunden, seiner Positionen und Transaktionen neu vom Service holen">
            {refreshing ? "Hole Werte …" : "Service-Werte aktualisieren"}
          </button>
        )}
      </div>
      <Notice kind="error">{error}</Notice>
      <Notice kind="ok">{info}</Notice>

      <section className="card">
        <div className="card-head">
          <h2>Produkte und Dienstleistungen</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setProductDraft({})} disabled={!productTypes.some((v) => v.active)}>
            Hinzufügen
          </button>
        </div>
        {noValues(productTypes)}
        {products.length === 0 ? (
          <p className="empty">Keine Produkte oder Dienstleistungen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Typ</th>
                  <th>ID</th>
                  <th>Geändert</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>
                      <span className="badge badge-accent">{labelOf(productTypes, p.productServiceType)}</span>
                    </td>
                    <td className="mono small">{p.id}</td>
                    <td>{formatDate(p.updatedAt)}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button className="btn btn-sm" onClick={() => setProductDraft(p)}>
                          Bearbeiten
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(`${base}/products/${p.id}`, `«${p.name}»`, reloadProducts)}>
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Positions
        url={`${base}/positions`}
        types={productTypes}
        attributesByType={attributesByType}
        trxAttributesByType={trxAttributesByType}
        positions={positions}
        isAdmin={isAdmin}
        onChange={setPositions}
      />

      <section className="card">
        <div className="card-head">
          <h2>Kommunikationspräferenzen</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setComPrefDraft({})} disabled={!comPrefTypes.some((v) => v.active)}>
            Hinzufügen
          </button>
        </div>
        {noValues(comPrefTypes)}
        {comPrefs.length === 0 ? (
          <p className="empty">Keine Kommunikationspräferenzen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Art</th>
                  <th>Verwendungshinweis</th>
                  <th>Geändert</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comPrefs.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="badge badge-accent">{labelOf(comPrefTypes, p.comPrefType)}</span>
                    </td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{p.usageInstruction}</td>
                    <td>{formatDate(p.updatedAt)}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button className="btn btn-sm" onClick={() => setComPrefDraft(p)}>
                          Bearbeiten
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() =>
                            remove(`${base}/communication-preferences/${p.id}`, `Präferenz «${labelOf(comPrefTypes, p.comPrefType)}»`, reloadComPrefs)
                          }
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {productDraft && (
        <RelationModal
          title={productDraft.id ? "Produkt / Dienstleistung bearbeiten" : "Produkt / Dienstleistung hinzufügen"}
          url={productDraft.id ? `${base}/products/${productDraft.id}` : `${base}/products`}
          method={productDraft.id ? "PATCH" : "POST"}
          initial={{ name: productDraft.name ?? "", productServiceType: productDraft.productServiceType ?? "" }}
          id={productDraft.id}
          onClose={() => setProductDraft(null)}
          onSaved={async () => {
            setProductDraft(null);
            await reloadProducts();
          }}
          render={(v, set) => (
            <>
              <label className="field">
                <span>Name</span>
                <input type="text" required maxLength={200} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} autoFocus />
              </label>
              <DomainSelect
                label="Typ"
                values={productTypes}
                value={v.productServiceType}
                original={productDraft.productServiceType}
                onChange={(code) => set({ ...v, productServiceType: code })}
              />
            </>
          )}
        />
      )}

      {comPrefDraft && (
        <RelationModal
          title={comPrefDraft.id ? "Kommunikationspräferenz bearbeiten" : "Kommunikationspräferenz hinzufügen"}
          url={comPrefDraft.id ? `${base}/communication-preferences/${comPrefDraft.id}` : `${base}/communication-preferences`}
          method={comPrefDraft.id ? "PATCH" : "POST"}
          initial={{ comPrefType: comPrefDraft.comPrefType ?? "", usageInstruction: comPrefDraft.usageInstruction ?? "" }}
          id={comPrefDraft.id}
          onClose={() => setComPrefDraft(null)}
          onSaved={async () => {
            setComPrefDraft(null);
            await reloadComPrefs();
          }}
          render={(v, set) => (
            <>
              <DomainSelect
                label="Art"
                values={comPrefTypes}
                value={v.comPrefType}
                original={comPrefDraft.comPrefType}
                onChange={(code) => set({ ...v, comPrefType: code })}
              />
              <label className="field">
                <span>Verwendungshinweis</span>
                <textarea
                  required
                  maxLength={2000}
                  rows={4}
                  value={v.usageInstruction}
                  onChange={(e) => set({ ...v, usageInstruction: e.target.value })}
                  placeholder="z.B. nur werktags zwischen 9 und 17 Uhr, Geschäftsadresse verwenden"
                />
              </label>
            </>
          )}
        />
      )}
    </>
  );
}

/** Active values of a domain, plus the record's current one if it was deactivated since. */
function DomainSelect({
  label,
  values,
  value,
  original,
  onChange,
}: {
  label: string;
  values: DomainValue[];
  value: string;
  original?: string;
  onChange: (code: string) => void;
}) {
  const options = values.filter((v) => v.active || v.code === original);
  const unknown = original && !values.some((v) => v.code === original);
  return (
    <label className="field">
      <span>{label}</span>
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Bitte wählen …
        </option>
        {unknown && <option value={original}>{original} (gelöscht)</option>}
        {options.map((v) => (
          <option key={v.code} value={v.code}>
            {v.label}
            {v.active ? "" : " (inaktiv)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function RelationModal<T extends Record<string, string>>({
  title,
  url,
  method,
  initial,
  id,
  onClose,
  onSaved,
  render,
}: {
  title: string;
  url: string;
  method: "POST" | "PATCH";
  initial: T;
  id?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  render: (value: T, set: (v: T) => void) => React.ReactNode;
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api(url, { method, body: v });
            await onSaved();
          } catch (err) {
            setError(errorText(err));
            setBusy(false);
          }
        }}
      >
        <h2>{title}</h2>
        <Notice kind="error">{error}</Notice>
        {render(v, setV)}
        {id && (
          <p className="small muted">
            ID <code>{id}</code>
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
