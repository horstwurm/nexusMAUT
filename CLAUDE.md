# nexusMAUT

Marketing automation for the nexus apps: customers (Kunden) with products,
positions and transactions, customer attributes, rules (customer segments),
journeys with steps (actions + content with placeholders) and services that
are called over HTTP. Login via **nexusIdentity** (`../nexusIdentity`, OIDC). One Next.js 16
app (App Router, TypeScript, React 19) with its own MongoDB database. UI text
is German («Du»), code, comments and commits are English. Same stack and
conventions as `../nexusIdentity` and `../nexusAd`.

@AGENTS.md

## Commands

```bash
npm run dev -- -p 3006   # dev server (reads .env.local); 3005 = nexusIdentity, 3000/3001/3004 other apps
npm run lint
npm run typecheck        # next typegen && tsc --noEmit
npm test                 # vitest: templates, CSV import, return URLs, birth dates
npm run build
npm run admin:grant -- someone@example.ch   # fallback: make a logged-in user admin
npm run auth:mode -- nexusIdentity|local    # emergency switch of the login mode (Admin → Anmeldung)
npm run sample:create    # 100 sample customers with products, positions, transactions (-- --replace to renew)
npm run sample:remove    # deletes all sample data again
npm run attributes:age   # copy every customer's age into the customer attribute «Alter» (re-run to refresh)
```

Sample data (`scripts/sample-data.mts`, Node type stripping, seeded – same
data every run): 100 customers in usage profiles (Basis, Sparer, Karte,
Familie, Anleger, Vermögend) with products, 1–2 communication preferences,
positions and transactions over the last 12 months. Existing product types
(e.g. `konto`, `depot`, `hypothek`) are reused with their own attributes –
values come from attribute name + type (`Saldo`, `ISIN`, `Betrag` …); missing
sample types (`sparkonto`, `kreditkarte`, `versicherung`, `beratung`) and
comPrefs (`email`, `telefon`, `post`, `sms`) are created. If the customer attribute
«Anrede» (list with «Herr» / «Frau») exists, it is set from the first name
(`FEMALE` in the script; no random numbers, so the rest stays the same). Every document
carries `sample: true`; `sample:remove` deletes only those (sample types still
used by real records stay). Remove before going live.

Local DB: the MongoDB in `~/mongodb` (port 27019), database `nexus-maut`.
If a new route sees `undefined` for a new collection or schema after edits,
or a changed validation still behaves the old way (Turbopack kept a stale
`db.ts` / `schemas.ts` or a lib they import), restart the dev server.
If pages flicker / reload in a loop ("✓ Compiled in …" after every request),
stop the dev server, `rm -rf .next` and start it again.
CI runs lint, typecheck and tests. Hosting: Vercel `fra1` (`vercel.json`).
All pages use the full window width (`.page`, 24px side padding).

## Decisions (2026-11)

- **Login via nexusIdentity** (OIDC authorization code + PKCE S256,
  confidential client, client_secret_basic) **or the own login** (e-mail +
  password, like nexusEAM) – switched in Admin → Anmeldung (2026-11-22).
- **Roles live here** (`users.role`: admin | editor | pending), not in
  nexusIdentity. The first user to log in becomes admin; later users are
  `pending` until an admin gives them a role (Administration → Benutzer).
- Contacts, campaigns, automations (with mail sending, unsubscribe links,
  daily cron) and the «Übersicht» start page were **removed** (2026-11-21);
  their collections (`contacts`, `campaigns`, `automations`, `enrollments`,
  `messages`) were dropped.

## Architecture

- **API** – route handlers wrapped in `route()` (`src/lib/server/http.ts`):
  JSON `{ error }`, `connection()`, `unstable_rethrow`. Bodies via
  `readJson(req, zodSchema)` (JSON only – blocks cross-site form posts).
  Shared schemas in `src/lib/server/schemas.ts` (route files may only export
  handlers / route config).
- **OIDC client** (`src/lib/server/oidc.ts`): discovery + JWKS cached on
  `globalThis`; ID token verified with jose (iss, aud, RS256, nonce).
  `/auth/login` stores state/nonce/verifier in `loginStates` (TTL 10 min)
  and binds it to the browser with the `oidc_state` cookie; `/auth/callback`
  checks both (single use) and `iss` (RFC 9207), upserts the user by `sub`
  and starts our session.
- **Login mode** (`src/lib/server/authSettings.ts`, `settings` doc `_id: "auth"`
  `{ mode: nexusIdentity | local, allowRegistration }`, typed view
  `authSettings` on the same collection; without a doc `AUTH_MODE`, default
  nexusIdentity). Admin tab «Anmeldung» (`AuthAdmin`, toggle switches; `GET/PUT
  /api/settings/auth`, admins). Lock-out guards: switching to local needs a
  password of the acting admin (409), to nexusIdentity client id + secret (409);
  emergency `npm run auth:mode`. Existing sessions stay valid on a switch.
  `/login` shows the nexusIdentity button or the password form; `/auth/login`
  and `/auth/callback` refuse in local mode, the password routes in
  nexusIdentity mode (403).
- **Own login** (local mode): `passwords.ts` (scrypt `scrypt$salt$hash`, NFKC,
  dummy hash for unknown e-mails), `POST /api/auth/login` (wrong → 400, not
  401 – the browser helper treats 401 as «session gone»; 10 failures per e-mail
  in 15 min → 429, `loginFailures` TTL), `POST /api/auth/register` (when
  allowed; account `_id: "local_<uuid>"`, `pending` – the very first user
  becomes admin; e-mail taken → 409), `POST /api/auth/password/forgot` (same
  answer for unknown e-mails; `passwordResets` sha256, single use, 60 min, mail
  via `sendMail` in mail.ts – console in dev) and `…/password/reset` (logs out
  everywhere). Pages `/register`, `/password/forgot`, `/password/reset`
  (`AuthShell`, forms in `src/components/AuthForms.tsx`). **«Mein Konto»**
  (`/account`, name in the top bar links there; both modes): `PATCH
  /api/account { name }`, `POST /api/account/password` (first password without
  the current one, so nexusIdentity users can prepare the own login; other
  devices logged out). `users.passwordHash` / `passwordChangedAt`; a
  nexusIdentity login links a `local_` user with the same **verified** e-mail
  (`oidcSub`) instead of creating a second one. Admin → Benutzer shows the
  login kinds (badges nexusIdentity / Passwort).
- **Session** (`src/lib/server/auth.ts`): httpOnly cookie `sid` (7 days),
  sha256 stored with the ID token (none after a password login). Logout
  (`POST /api/auth/logout`) ends it and returns `/` after a password login,
  otherwise the nexusIdentity `end_session` URL with `id_token_hint` and
  `post_logout_redirect_uri` = `APP_URL` without a trailing slash (single
  sign-out; nexusIdentity compares it exactly with the registered URI –
  `NEXUS_POST_LOGOUT_URI` overrides it).
  `requireUser(min)` for APIs, `requirePageUser(path, min)` for pages.
- **Customers** (`customers`, `/customers`, `/api/customers[/ID]`): people
  with `name`, `lastname`, `dateOfBirth` (no e-mail,
  not mailed). Birth date: calendar day as UTC midnight, API `YYYY-MM-DD`,
  1900 … today (`src/lib/customers.ts`, schema `customerInput`). Editors and
  admins manage them; list sorted by last name (German collation).
- **Customer relations** (1:n, own collections with `customerId`, deleted
  with the customer): `customerProducts` (`name`, `productServiceType`; the
  generated `_id` is the product's id) and `customerComPrefs`
  (`usageInstruction`, `comPrefType`). API
  `/api/customers/ID/products[/PID]` and
  `/api/customers/ID/communication-preferences[/CID]` (GET list, POST,
  PATCH, DELETE); UI on `/customers/ID`.
- **Domains** (admin-managed value lists, `domainValues`, `src/lib/domains.ts`):
  `productServiceType` and `comPrefs`, managed on `/admin` (admins) via
  `/api/domains[?domain=…]` / `/api/domains/ID`. Records store the value's
  `code` (fixed after creation, unique per domain); `label`, `sort`, `active`
  may change. New or changed records need an active value
  (`assertDomainValue`), but keep their current one when it was deactivated
  since. A value in use can't be deleted (409) – deactivate it instead.
  Adding a domain: extend `DOMAINS`, the zod enum in `schemas.ts` and
  `domainUsage`.
- **Type attributes** (`src/lib/typeAttributes.ts`): two relations of each
  `productServiceType` value (by `domainValues._id` = `typeId`) with the same
  shape – `productServiceTypePositionAttributes` (`db.positionAttributes`,
  values in product positions) and `productServiceTypeTrxAttributes`
  (`db.trxAttributes`, transaction attributes – values in `positionTransactions`).
  Ordered attributes `attribute` (name, unique per type and relation,
  case-insensitive) + `attributeType`: `alpha` | `num` | `date` | `bool` |
  `list` (`list` needs `options`, others have none). `ATTRIBUTE_KINDS` maps
  kind `position` | `trx` to its API segment; API
  `/api/domains/TYPE_ID/(position|trx)-attributes[/AID]` (GET editors;
  POST, PUT, PATCH {sort}, DELETE admins). UI: «Positionsattr. (n)» and
  «Transaktionsattr. (n)» per type on `/admin`. Deleting a type deletes both;
  deleting a position attribute `$unset`s its values from all positions.
  The collection was called `productServiceTypeAttributes` until 2026-11;
  `init` renames it once (`RENAMED` in `db.ts`).
- **Customer positions** (`customerPositions`, relation customer 1:n;
  `src/lib/positions.ts`): a `productServiceType` (code, active value needed
  for new / changed types) + `values` of that type's position attributes,
  keyed by attribute id (survives renames). Typed alpha/list/date → string
  (date `YYYY-MM-DD`, list = the option's spelling), num → number (accepts
  `1'250.50` / `12,5`), bool → boolean. `parsePosition` drops keys of other
  attributes and empty values and needs ≥ 1 value. The type may change on
  edit (values re-checked against the new type). Positions count as usage of
  their type (no delete while used). API
  `/api/customers/ID/positions[/POS]` (GET, POST / PUT `{ productServiceType,
  values }`, PATCH {sort}, DELETE); deleted with the customer, independent
  of the customer's products. UI: «Positionen» on `/customers/ID` (anchor
  `#positionen`), one table per type; the list API returns `positionCount` (shown on
  the customer's accordion toggle). Both pages get the
  form data from `attributesByType(types, "position" | "trx")`. After an attribute's type changes, old values are shown as
  stored (`formatValue`) and re-checked on the next edit.
  Until 2026-11 positions belonged to customer products (`productPositions`
  with `productId`); `init` migrates them once (`movePositionsToCustomers`:
  type from the product, same `_id`, orphans dropped, old collection dropped).
- **Position transactions** (`positionTransactions`, relation
  customerPositions 1:n): `values` of the position type's transaction
  attributes (`productServiceTypeTrxAttributes`, by attribute id), same
  value rules as positions (`parsePosition`). `customerId` denormalised for
  the customer delete. API `/api/customers/ID/positions/POS/transactions[/TRX]`
  (GET, POST / PUT `{ values }`, PATCH {sort}, DELETE). Deleted with the
  position / customer; deleting a trx attribute `$unset`s its values. A
  position with transactions can't change its type (409). Position lists
  carry `transactionCount` (`toCustomerPositions`).
- **Customer UI components** (`src/app/customers/[id]/`): `Positions`
  (heading «Positionen n»; tables per type, each position an accordion row → `Transactions` (heading «Transaktionen n» with «+ Transaktion»), loaded
  when opened,; `embedded` for use inside another list), `CustomerPositionsPanel`
  (loads a customer's positions), `PositionModal`, `AttributeFields` (inputs
  per attribute type, shared by position and transaction forms). The Kunden
  list (`/customers`) is an accordion: customer → positions → transactions,
  all manageable there; the detail page shows the same `Positions`.
- **Customer attributes** (relation `customerAttributes`, collection of that
  name): attributes every customer can have, same shape as type attributes
  (`attribute` unique case-insensitive, `attributeType`, `options` for
  `list`, `sort`). Values in `customers.attributes` (attribute id → value),
  checked by `parseAttributeValues` (like positions, but no value needed);
  customer POST / PATCH take `attributes` (omitted = kept, given = replaced).
  API `/api/customer-attributes[/ID]` (GET editors; POST, PUT, PATCH {sort},
  DELETE admins – DELETE `$unset`s the values). Admin card «Kundenattribute»
  uses the generic `AttributesModal` (also behind `TypeAttributesModal`);
  fields in the customer form (`AttributeFields`), values on the detail page.
- **Admin page** (`/admin`): tabs (`AdminTabs`, active tab in `?tab=`) –
  Kundenattribute (with the value list Kommunikationspräferenzen below;
  `?tab=com-prefs` opens it), Produkt- und Dienstleistungstypen, Aktionen, Services (with the value list Servicetypen below;
  `?tab=service-types` opens it), Benutzer (user
  roles, was the page `/users` – now a redirect to `/admin?tab=users`), Anmeldung, E-Mail. All panels stay mounted (unsaved input
  survives a tab switch).
- **E-mail settings** (`settings` doc `_id: "mail"`, `src/lib/server/mail.ts`):
  SMTP host, port, user, password (AES-256-GCM via `encrypt` / `decrypt`
  in crypto.ts, key from SECRET_KEY – never sent to the page), sender,
  reply-to. Saved Admin settings override the NODE_MAILER_* env vars;
  `mailConfig()` reports the source (admin | env | none). The pooled
  transport is rebuilt when the settings change. API `/api/settings/mail`
  (GET, PUT – empty password = keep, `clearPassword` – DELETE = back to env),
  `POST /api/settings/mail/test { to }` (verify + send; SMTP errors → 502
  with the reason; no SMTP in dev → printed to the console). Admins only.
- **Journeys** (`journeys`, `src/lib/server/journeys.ts`):
  `name` (unique, case-insensitive) + `description`. API
  `/api/journeys[/ID]` (GET editors; POST, PUT, DELETE admins);
  Page `/journeys` in the top bar (admins; `JourneysClient`, formerly an
  Admin tab – `/admin?tab=journeys` redirects). Each journey has ordered steps (relation
  `journeySteps`): `actionId` (→ `actions`) and `content` (free text, max
  10'000, multi-line). API `/api/journeys/ID/steps[/SID]` (GET editors;
  POST, PUT, PATCH {sort}, DELETE admins); «Schritte (n)» per journey →
  `JourneyStepsModal` (src/app/journeys/). Steps go with the journey; an action used by a step
  can't be deleted (409). Until 2026-11 steps had `status` (value list
  `actionStatus`, removed) and `feedback` instead of `content`.
  Customers run through journeys as KundenJourneys (below).
  The template model was called customerJourney (collection
  `customerJourneys`) until 2026-11 and was renamed then; the name now
  belongs to the journeys of customers (KundenJourneys), so that one-time
  rename is no longer in `RENAMED`.
- **Placeholders** in journey step contents (`src/lib/placeholders.ts`, tested):
  `{{Kunde.Vorname|Nachname|Geburtsdatum|Alter}}`, `{{Kunde.<customer
  attribute>}}`, `{{Produkt.Name|Typ}}`, `{{Position.<type code>.<attribute>}}`,
  `{{Transaktion.<type code>.<attribute>}}`, `{{Service.<service name>.<GET
  attribute>}}` (only services with GET attributes); service **lists**:
  `{{Service.S.L.Anzahl}}`, `{{Service.S.L.Summe(Spalte)}}` (number columns
  only), `{{Service.S.L.Erste.Spalte}}` and the block
  `{{#Service.S.L}} … {{Spalte}} … {{/Service.S.L}}` (repeated per row, one
  level, global placeholders allowed inside; `parseTemplate` → nodes,
  `unknownPlaceholders` flags unknown columns / unclosed blocks / strays) –
  names as defined in Admin,
  type by its fixed code; matching case-insensitive. `GET /api/placeholders`
  builds the catalog from Admin (`placeholderCatalog`), groups carry a
  `category` (Kunde, Produkte, Positionen, Transaktionen, Services – optgroups
  in the picker); the editor
  (`src/components/Placeholders.tsx`: `PlaceholderPicker` inserts at the
  cursor, `WithPlaceholders` highlights) flags unknown ones (renamed /
  deleted attribute, typo) – a warning, saving isn't blocked.
  **Step test** («Testen» per step → `StepTestModal` in src/app/journeys/, `POST
  /api/journeys/ID/steps/SID/test { customerId, content? }`, admins,
  `src/lib/server/stepPreview.ts`): renders a content for one customer
  (`renderPlaceholders` → segments). Rules: Kunde.* = fields / customer
  attributes; Produkt.* = all products comma-separated; Position.T.A = all
  positions of type T comma-separated; Transaktion.T.A = the latest
  transaction of T (by its first date attribute, else the last); Service.S.A
  = S is called once per test (`callService` in serviceCaller.ts, shared with
  Admin «Testen»), its PUT attributes filled from customer fields /
  attributes of the same name; not available or no URL → sample data
  (marked). Steps aren't applied to customers otherwise yet.
- **Services** (`services`, `src/lib/server/services.ts`, kinds in
  `src/lib/services.ts`): `name` (unique, case-insensitive), `url` (optional,
  http(s) only, "" = none) + `serviceType` (code of the value list `serviceType`, Admin tab «Servicetypen»; active
  value needed, a service keeps one deactivated since; a type in use can't
  be deleted). Two attribute relations, same shape as type attributes:
  putAttributes (`servicePutAttributes`) and getAttributes
  (`serviceGetAttributes`), `serviceId`, name unique per service and
  relation. API `/api/services[/ID]` and `/api/services/ID/(put|get)-attributes[/AID]`
  (GET editors; POST, PUT, PATCH {sort}, DELETE admins). Admin tab
  «Services» with «PUT-Attribute (n)» / «GET-Attribute (n)» →
  `AttributesModal`. Deleting a service deletes its attributes.
  **Calling a service** (`src/lib/serviceCall.ts` pure + tested,
  `POST /api/services/ID/call { method, values }`, admins; Admin «Testen» →
  `ServiceCallModal`): PUT attribute values (checked by
  `parseAttributeValues`) go by attribute **name** as JSON body (POST / PUT)
  or query parameters (GET). The JSON response – or its `data` / `result`
  object – is mapped onto the GET attributes by name (case-insensitive) and
  checked per type (`ok` / `missing` / `invalid` with reason). Runs on the
  server (no CORS; admin-configured URL only – mind SSRF if non-admins ever
  get to call), 10 s timeout, response read up to 1 MB; service errors come
  back as 200 with `error` and the raw answer. Not available (no answer,
  timeout, 404, 5xx – `isUnavailable`) → `mock`: the expected answer with
  stable sample values per GET attribute (`mockResponse`), mapped like a real
  one and shown as «Beispiel» in the dialog.
  **List GET attributes** (`list: { path, columns }` on `serviceGetAttributes`,
  `ListSpec` / `listSpecProblem` in serviceCall.ts; `serviceGetAttributeInput`
  – PUT attributes stay simple, a `list` there is dropped): a table with own
  columns (simple types only, one level, ≤ 30 columns), found under the
  attribute name or at a dotted `path` from the response root (each step
  case-insensitive). Rows are checked per column («Zeile 2: «Menge»: Zahl
  erwartet»), max 1000 rows read; sample data = 2 rows at the path. Editor:
  `AttributesModal` with `allowList` (type «Liste (Tabelle mit Spalten)»);
  dialog shows lists as a nested table. Not yet in rules.
  **Mock** (`services.mock`, toggle switch in the Admin form, badge «Mock»):
  the service isn't called at all – `callService(…, { mock: true })` answers
  `random: true` with random values per GET attribute (`randomResponse` in
  serviceCall.ts: text «Name Wort n», number 0–10'000, date ±1 year, any option,
  lists 1–5 rows). Works without URL. «Testen» shows a Mock notice, the step
  test marks the values like sample data; «Service» attributes **store** the
  random values (each record its own – mock calls aren't shared in a run).
- **Actions** (Aktionen, `actions`, `src/lib/server/actions.ts`): `name`
  (unique, case-insensitive), `description`, `url` (optional http(s), shared
  `optionalUrl` schema with services). API `/api/actions[/ID]` (GET
  editors; POST, PUT, DELETE admins); Admin card «Aktionen». Each action has
  attributes (relation `actionAttributes`, `actionId`, same shape as type
  attributes, name unique per action): `/api/actions/ID/attributes[/AID]`
  (GET editors; POST, PUT, PATCH {sort}, DELETE admins), «Attribute (n)» per
  action → `AttributesModal`; deleted with the action. Only definitions so
  far – nothing stores action attribute values, actions aren't linked to
  rules yet.
- **Rules** (UI «Kunden Selektionen» / «Selektion», was «Regeln»; code,
  route `/rules` and collection `rules` keep the old name; `src/lib/rules.ts` pure + tested,
  `src/lib/server/rules.ts`): customer segments. A rule = `match` all | any
  over conditions on three levels – `customer` (Vorname, Nachname, Alter,
  Geburtsdatum, or `field: "attribute"` + `attrId` for a customer attribute), `position` (count of positions of a type, optional filter
  on a position attribute; `= 0` = «has none») and `trx` (count or sum of a
  num attribute over a type's transactions, optional attribute filter and
  «last N days» on a date attribute). Operators per value type
  (`OPERATORS_BY_TYPE`; dates also «zwischen» = `[from, to]`, inclusive, one end
  may be empty, checked by `rangeProblem`; any date value may be `TODAY`
  ("@heute") = the day the rule is evaluated, editor «Datum | heute»;
  «in den letzten / nächsten … Tagen» compare the date itself, the
  anniversary operators `anniversaryNext` / `anniversaryLast` («Jahrestag …»,
  e.g. birthdays) only day + month, 0–366 days, 29.2. → 28.2. in non-leap years); a missing value only matches «leer» / «ist nicht»;
  a filter on a deleted attribute matches nothing; a rule without conditions
  matches nobody. Evaluated in memory over all customers
  (`loadRuleDataset` once per request). API `/api/rules[/ID]` (list with
  `matchCount`), `/api/rules/ID/matches`, `POST /api/rules/preview` (unsaved
  rule, first 50). Rules only select customers so far – no actions.
  Service values are compared as «Service» attributes (below); the separate
  service conditions (level `service`, 2026-11) were removed again – `init`
  converts old ones once into conditions on «Service» customer attributes
  (`convertServiceConditions`, attribute created with the GET attribute's name).
- **«Service» attributes** (`service: { serviceId, attrId }` on customer,
  position and trx attributes; `src/lib/server/serviceSources.ts`,
  `serviceAttributes.ts`): the value comes from a simple GET attribute of a
  service (not a list); type and options are copied from it
  (`resolveAttributeSource`, kept in sync when the GET attribute changes; a GET
  attribute / service in use can't be deleted or become a list – 409). Input
  `sourcedAttributeInput`; Admin: attribute type «Service» in `AttributesModal`
  (`allowService`, «Werte aktualisieren» per attribute → `POST
  /api/service-attributes/refresh { kind, attrId }`, admins). Values are
  **stored** like normal values (`customers.attributes`, `values` of positions /
  transactions) plus `serviceFetched[attrId] = { at, error }`; rules,
  placeholders and lists read the stored value. Fetched again when the record
  is saved (customer POST/PATCH, position / transaction POST/PUT) and by
  «Service-Werte aktualisieren» on the customer page (`POST
  /api/customers/ID/refresh-services`, customer + positions + transactions)
  and «Daten aktualisieren» on the Kunden list (`POST
  /api/customers/refresh-services { customerIds? }` → `refreshCustomers`: all
  customers, or the ones shown while searching, with positions and
  transactions, one run; editors).
  PUT values by name: transaction → its position → customer (Vorname,
  Nachname, Geburtsdatum, Alter, customer attributes). Unavailable / no URL /
  error → stored value kept, error noted (never sample data); answer without
  the attribute → value removed. One call per service + PUT values per run,
  8 at a time; after the first unavailable answer the service isn't called
  again in that run. In forms the field is read-only (`AttributeFields`
  `fetched`); the form sends it back, the refresh after saving overwrites it.
  Tables (Kunden list: one column per customer attribute; position and
  transaction tables) use `AttrHeader` / `AttrCell` (AttributeFields.tsx):
  service attributes marked ⚡, source / fetch time / error as tooltip, each
  value tagged «echt» or «Mock» (`serviceFetched[attrId].mock` – set when a
  value is fetched; a failed fetch keeps the stored value and its flag, as the
  metadata is written field by field).
- **Homepage** (`/`, `src/app/page.tsx`): logged out the public landing page
  (`src/components/home/Landing.tsx`, German, «Du»: hero with an animated
  customers → Selektion → Journey graphic, `StatsStrip` with live counts from
  `homeStats()` counting up, the areas Kunden / Selektionen / Journeys /
  Services / Begleiten with illustrated mini views – **fictional example data
  only, never real customers** –, steps, benefits, FAQ, security); logged in the
  start page (`AppHome`): greeting, the «Heute» panel (`today()` in
  `src/lib/server/home.ts`: active KundenJourneys, open steps, steps with a data
  error, records whose last service fetch failed, the five most urgent runs –
  data errors first – linking to `/customer-journeys?journey=…`) and tiles
  (Journeys / Services / Administration for admins). Pending users go to
  `/pending`. Landing texts on login / security follow the login mode
  (`authMode` prop). Styles: `.hp-*` in globals.css; icons `HomeIcon` (nexusEAM style).
  Keep the landing texts in step with what the app really does (e.g. nothing is
  mailed automatically yet).
- **DB cache**: only the connection is cached on `globalThis`; collections and
  indexes are rebuilt after a hot reload (no dev server restart for new ones).

- **KundenJourneys** (journeys of customers; `customerJourneys` +
  `customerJourneySteps`, `src/lib/server/customerJourneys.ts`, page
  `/customer-journeys` in the top bar, editors and admins): assigning a journey
  (to chosen customers, or all customers matching a Kunden Selektion –
  `source` keeps which) creates a run per customer and **copies** the
  template steps (`template` = content at assignment; later template edits
  don't change running journeys). One **active** run per customer and journey
  (partial unique index); others are skipped. Step status open / done /
  skipped; «done» renders the content for the customer via `previewStep`
  (placeholders, services) and keeps it with `unfilled` placeholders. Run
  status follows the steps: all finished → done, reopened → active; cancelled
  runs are locked until reactivated. API `/api/customer-journeys[/ID]`
  (GET ?journeyId&status&customerId&q, POST assign, PATCH {status}, DELETE)
  and `/api/customer-journeys/ID/steps/SID` (PATCH {status, note?});
  `POST …/steps/SID/test` renders the step for the run's customer without
  changing it («Testen», result view `StepPreviewResult` shared with the
  journey step test); `GET /api/customer-journeys/summary` = runs per journey
  and status. Page: journeys as a left navigation (`.side-nav`, counts
  active / total), the selected one (`?journey=ID`) on the right with
  «Kunden zuweisen» and its runs.
  **Data check** («Daten prüfen» on the page, `POST /api/customer-journeys/check
  { journeyId | customerJourneyId }`, `checkData`): renders the **open** steps
  of the active runs for their customer and sets the step's `dataStatus`
  (unchecked | ok | error = «Datenfehler») with `dataProblems` (placeholders
  without a value, service errors; sample data counts as ok). Services are
  called once per customer (`ServiceCache` in stepPreview.ts). Marking a step
  done sets it the same way. Runs carry `dataErrors` (shown in the list).
  **Customer feedback** (relation `customerFeedbacks`, per step):
  `feedback` (required, ≤ 200), `feedbackComment` (≤ 2000), `feedbackRating`
  (1–5 or null). API `…/steps/SID/feedbacks[/FID]` (GET, POST, PUT, DELETE;
  editors); step views carry `feedbacks`, shown in the step overview
  (column «Feedback», «+ Feedback»). Deleted with the run / customer. A journey
  template in use can't be deleted (409); deleting a customer deletes its runs.

## Not yet

List results in rules, actions linked to rules, automatic step execution
(KundenJourney steps are marked done by hand), KundenJourneys on the
customer detail page.
