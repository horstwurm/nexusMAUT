import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TopBar } from "@/components/TopBar";
import { DOMAINS } from "@/lib/domains";
import { listActions } from "@/lib/server/actions";
import { requirePageUser, toMe } from "@/lib/server/auth";
import { authSettingsView } from "@/lib/server/authSettings";
import { collections } from "@/lib/server/db";
import { domainValues, toAdminDomainValue, toTypeAttribute } from "@/lib/server/domains";
import { mailSettingsView } from "@/lib/server/mailSettings";
import { listServices } from "@/lib/server/services";
import { ActionsAdmin } from "./ActionsAdmin";
import { AuthAdmin } from "./AuthAdmin";
import { AdminTabs } from "./AdminTabs";
import { CustomerAttributesAdmin } from "./CustomerAttributesAdmin";
import { DomainAdmin } from "./DomainAdmin";
import { MailAdmin } from "./MailAdmin";
import { ServicesAdmin } from "./ServicesAdmin";
import { UsersClient } from "./UsersClient";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const user = await requirePageUser("/admin", "admin");
  const { tab } = await searchParams;
  // Journeys moved to its own page in the top bar
  if (tab === "journeys") redirect("/journeys");
  const { customerAttributes, users } = await collections();
  const [customerAttrs, actions, productTypes, comPrefs, mail, serviceTypes, services, auth] = await Promise.all([
    customerAttributes
      .find()
      .sort({ sort: 1, attribute: 1 })
      .toArray()
      .then((list) => list.map((a) => toTypeAttribute({ ...a, typeId: null }))),
    listActions(),
    domainValues("productServiceType").then((list) => Promise.all(list.map(toAdminDomainValue))),
    domainValues("comPrefs").then((list) => Promise.all(list.map(toAdminDomainValue))),
    mailSettingsView(),
    domainValues("serviceType").then((list) => Promise.all(list.map(toAdminDomainValue))),
    listServices(),
    authSettingsView(),
  ]);
  const viaIdentity = (u: { _id: string; oidcSub?: string }) => !u._id.startsWith("local_") || Boolean(u.oidcSub);
  const userList = (await users.find().sort({ role: -1, name: 1 }).toArray()).map((u) => ({
    ...toMe(u),
    lastLoginAt: u.lastLoginAt.toISOString(),
    hasPassword: Boolean(u.passwordHash),
    nexusIdentity: viaIdentity(u),
  }));

  return (
    <>
      <TopBar me={toMe(user)} active="admin" />
      <main className="page page-full">
        <div className="page-head">
          <div>
            <h1>Administration</h1>
            <p className="muted" style={{ margin: 0 }}>
              Kundenattribute, Wertelisten, Aktionen, Services, Benutzer, Anmeldung und E-Mail-Versand.
            </p>
          </div>
        </div>
        <AdminTabs
          // «com-prefs» / «service-types» were own tabs – now part of «Kundenattribute» / «Services»
          initial={tab === "com-prefs" ? "customer-attributes" : tab === "service-types" ? "services" : (tab ?? "customer-attributes")}
          tabs={[
            {
              id: "customer-attributes",
              label: "Kundenattribute",
              count: customerAttrs.length,
              // the customer attributes and the value list for the customers' communication preferences
              content: (
                <>
                  <CustomerAttributesAdmin initial={customerAttrs} />
                  <DomainAdmin domain="comPrefs" initial={comPrefs} />
                </>
              ),
            },
            {
              id: "product-types",
              label: DOMAINS.productServiceType.title,
              count: productTypes.length,
              content: <DomainAdmin domain="productServiceType" initial={productTypes} />,
            },
            { id: "actions", label: "Aktionen", count: actions.length, content: <ActionsAdmin initial={actions} /> },
            {
              id: "services",
              label: "Services",
              count: services.length,
              // the services and their value list «Servicetypen» below
              content: (
                <>
                  <ServicesAdmin initial={services} types={serviceTypes} />
                  <div id="servicetypen">
                    <DomainAdmin domain="serviceType" initial={serviceTypes} />
                  </div>
                </>
              ),
            },
            {
              id: "users",
              label: "Benutzer",
              count: userList.length,
              content: (
                <section className="card">
                  <h2>Benutzer</h2>
                  <p className="small muted">
                    {auth.mode === "local"
                      ? "Wer sich registriert, erscheint hier und wartet auf eine Rolle."
                      : "Wer sich mit nexusIdentity anmeldet, erscheint hier und wartet auf eine Rolle."}
                  </p>
                  <UsersClient meId={user._id} initial={userList} />
                </section>
              ),
            },
            {
              id: "auth",
              label: "Anmeldung",
              content: <AuthAdmin initial={auth} myPassword={Boolean(user.passwordHash)} myIdentity={viaIdentity(user)} />,
            },
            { id: "email", label: "E-Mail", content: <MailAdmin initial={mail} myEmail={user.email} /> },
          ]}
        />
      </main>
    </>
  );
}
