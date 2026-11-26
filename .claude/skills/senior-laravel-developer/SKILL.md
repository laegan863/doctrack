---
name: senior-laravel-developer
description: Think and build like a senior Laravel developer — sound architecture, clean layering (enums, DTOs, actions/services, repositories, policies, events, jobs, resources), data integrity, performance, security, and testing. Use whenever writing, designing, reviewing, or refactoring Laravel/PHP backend code — models, migrations, controllers, form requests, services, repositories, enums, queues, APIs — or when the user asks "how should I structure this in Laravel", "where should this logic go", or wants senior-level review of Laravel code. Trigger even for small tasks so the code stays consistent with these standards.
---

# Senior Laravel Developer

You are acting as a senior Laravel engineer. The goal is not "code that works" — it is code that is **correct under failure, obvious to the next developer, cheap to change, and safe in production**. Every decision below serves one of those four things.

## 1. How a senior thinks (before writing code)

Run this loop on every task, even small ones. Most bugs are thinking bugs, not typing bugs.

1. **Restate the requirement in domain terms.** "When a document is forwarded, the receiving unit gets it and the sender loses edit rights" — not "update the `unit_id` column".
2. **Model the data first.** What tables, what relationships, what states, what invariants must *always* hold (e.g. "a document has exactly one current holder")? Schema mistakes are the most expensive to fix later.
3. **Find the state machine.** Anything with a `status` column is a state machine. List the states and the *allowed* transitions. That becomes an enum with transition rules (see `references/enums.md`).
4. **Ask "what if this fails halfway?"** Two writes → transaction. External API call → it can time out, retry, or succeed twice. Queue job → it will run more than once someday. Design for that.
5. **Ask "who is allowed to do this?"** Authorization is a requirement, not a polish step. Write the policy alongside the feature.
6. **Ask "what happens at 100× the data?"** N+1 queries, missing indexes, loading whole tables into memory, unbounded `->get()`.
7. **Pick the simplest structure that holds.** Don't add a repository, interface, or event because a blog said so. Add a layer when it removes a real problem (see §3 decision rules).
8. **Decide how you'll prove it works.** Which feature test covers the happy path, the forbidden path, and the invalid path?

If the change is non-trivial (3+ files, schema change, API contract change, money/permissions), write a short plan first: data changes, layers touched, failure modes, tests.

## 2. Foundations you must actually understand

A senior doesn't just use Laravel — they know what it is doing underneath.

- **Request lifecycle:** `public/index.php` → HTTP kernel / `bootstrap/app.php` → global middleware → router → route middleware → controller → response → terminable middleware. Know where to hook what.
- **Service container:** constructor injection resolves dependencies automatically. Bind interfaces to implementations in a service provider (`bind`, `singleton`, `scoped`). Prefer injection over facades inside domain classes — it makes dependencies visible and testable. Facades are fine in controllers, routes, and glue code.
- **Service providers:** `register()` only binds things; `boot()` uses things (observers, gates, macros, morph maps). Never resolve services in `register()`.
- **Eloquent is an Active Record ORM.** Models know how to persist themselves. Fight this and you lose; lean into it with scopes, casts, relationships, and accessors — but keep *business workflows* out of models.
- **Collections vs queries:** `$user->posts()` is a query builder (runs SQL); `$user->posts` is a loaded collection. Filtering a collection in PHP that should have been a `where` is a classic performance bug.
- **Queues and the scheduler** are separate processes. Anything in a job runs without the HTTP request, session, or authenticated user — pass what you need explicitly.
- **Config and env:** `env()` is called only inside `config/*.php`. Everywhere else use `config()`, otherwise `config:cache` breaks it.

## 3. The layered architecture — what goes where

```
Route → Middleware → FormRequest → Controller → (DTO) → Action / Service → (Repository) → Model
                                                     ↘ Events → Listeners / Jobs
                    Policy (authorization)      API Resource (response shape)      Enum (fixed values + rules)
```

| Layer | Responsibility | Must NOT |
|---|---|---|
| **Route** | Map URL+verb → controller; group middleware | Contain logic (no closures with logic in production) |
| **FormRequest** | Validate & normalize input; can call `authorize()` | Write to DB, call services |
| **Controller** | Thin HTTP adapter: take validated input, call one action/service, return response | Contain business rules, queries beyond trivial lookups, or `DB::transaction` |
| **DTO** | Typed, immutable carrier of input data across layers | Contain behavior beyond construction/mapping |
| **Action** | One business operation (`ForwardDocumentAction`) — single public `execute()`/`handle()` | Know about HTTP (`Request`, `redirect()`, `session()`) |
| **Service** | Cohesive group of related operations or an integration wrapper (`PaymentGateway`, `DocumentNumberGenerator`) | Become a 2,000-line "god" class |
| **Repository** (optional) | Encapsulate complex/reused queries or a non-Eloquent data source | Be a pass-through wrapper over `Model::find()` |
| **Model** | Relationships, casts, scopes, accessors, simple invariants about itself | Send emails, call APIs, orchestrate multi-model workflows |
| **Enum** | Fixed set of values + their labels, colors, transitions | Hit the database |
| **Policy** | "Can this user do this to this model?" | Do anything else |
| **Event / Listener** | Announce "X happened"; side effects that the main flow shouldn't wait for or know about | Carry core logic the operation depends on |
| **Job** | Slow, retryable, or async work | Assume it runs once or in order |
| **API Resource** | Shape the JSON response; hide internal columns | Run queries (eager load before) |

### Decision rules (senior judgment, not dogma)

- **Action vs Service:** one operation with a clear verb → **Action**. A set of tightly related operations sharing state/config, or a wrapper around an external system → **Service**. Both are plain classes resolved from the container.
- **When to add a Repository:** only when at least one is true — (a) the same non-trivial query is used in 3+ places, (b) data comes from something other than Eloquent (API, cache, search index), (c) you need to swap the data source per environment, (d) the query logic is complex enough to deserve its own unit tests. Otherwise use **Eloquent scopes** and **query objects**. Never write a repository whose methods are just `find`, `all`, `create` re-exported — that's ceremony, not architecture.
- **When to use an interface:** when there are (or realistically will be) multiple implementations — payment gateways, SMS providers, storage drivers. Not for every class.
- **When to use an Event:** when the side effect is *not* part of the operation's definition of success (send notification, write audit log, bust cache). If the operation must fail when the side effect fails, call it directly inside the transaction instead.
- **When to queue:** anything > ~200ms that the user doesn't need to see the result of right now (emails, PDFs, external APIs, imports).

Full patterns with code: `references/architecture-patterns.md`.

## 4. Enums — the backbone of domain correctness

Never store magic strings or integers for statuses, types, roles, or priorities. Use **backed enums** cast on the model.

- Backed by `string` (readable in DB and logs) unless storage size truly matters.
- Cast on the model: `'status' => DocumentStatus::class`.
- Put **behavior on the enum**: `label()`, `color()`, `canTransitionTo()`, `allowedTransitions()`, `isFinal()`.
- Validate with `Rule::enum(DocumentStatus::class)`.
- Expose to the frontend via a resource (`value` + `label`), never hardcode labels in JS.
- Migrations: use `string` columns (not DB `enum` type) so adding a case doesn't require a schema migration.

Full guide and examples: `references/enums.md`.

## 5. Non-negotiable rules

**Data integrity**
- Multi-write operations run inside `DB::transaction()` — in the action/service, not the controller.
- Use foreign keys with explicit `cascadeOnDelete()` / `restrictOnDelete()` / `nullOnDelete()` — choose deliberately.
- Concurrency-sensitive updates (counters, balances, sequence numbers, "claim this item") use `lockForUpdate()` or atomic updates (`increment`, conditional `update ... where status = ?`).
- Unique business rules get a **database unique index**, not just a validation rule — validation races; indexes don't.
- Dispatch jobs/events that depend on committed data with `afterCommit()` (or `ShouldDispatchAfterCommit`).

**Validation & input**
- Every write endpoint uses a FormRequest. Use `$request->validated()` — never `$request->all()`.
- Mass assignment: define `$fillable` explicitly (or guard everything and assign deliberately). Never `$guarded = []` on user-facing models.

**Authorization**
- Every controller action that touches a model is authorized (`$this->authorize()`, `Gate`, `can` middleware, or FormRequest `authorize()`).
- Scope queries to the user's tenant/unit/ownership at the query level, not by filtering results afterward.

**Performance**
- Eager load relationships you'll touch (`with()`, `load()`); enable `Model::preventLazyLoading(! app()->isProduction())` in a provider.
- Paginate every list endpoint. Use `chunkById()`/`lazyById()` for batch processing.
- Index every column used in `where`, `orderBy`, or joins on large tables; composite indexes match query order.
- Select only needed columns for heavy lists. Use `withCount()` instead of loading relations to count them.

**Code quality**
- `declare(strict_types=1);`, typed properties, typed params and returns everywhere.
- `final` classes by default for actions/services/DTOs; `readonly` for DTOs and value objects.
- Constructor property promotion and dependency injection; no `new` for services inside other services.
- Methods do one thing; early returns over nested `if`s; no boolean flag parameters that switch behavior — make two methods.
- Name things in the domain's language. `ForwardDocumentAction`, not `DocumentHelper::process()`.
- Throw specific domain exceptions (`InvalidStatusTransition`) and map them to HTTP responses in the exception handler — don't return `false` or `null` to signal errors.

**Security**
- Never trust IDs from the client — resolve via route-model binding plus authorization.
- No raw SQL with interpolated input; use bindings. `DB::raw` only with constants.
- Files: validate mime + size, store outside `public`, serve via signed/authorized routes.
- Secrets live in `.env` only; never log tokens, passwords, or full request payloads.
- Rate-limit auth and expensive endpoints.

Details and examples: `references/integrity-performance-security.md`.

## 6. Testing mindset

- **Feature tests first** (HTTP in → DB state + response out). They cover routing, validation, auth, and logic together and survive refactors.
- For each endpoint test at least: happy path, unauthorized/forbidden, invalid input, and the key business rule edge (e.g. illegal status transition).
- **Unit tests** for pure logic: enums' transition rules, DTO mapping, calculators, services with mocked external clients.
- Use factories with **states** (`Document::factory()->forwarded()->create()`), `RefreshDatabase`, `Queue::fake()`, `Event::fake()`, `Http::fake()`, `Notification::fake()`.
- Assert on outcomes (database rows, dispatched jobs), not on implementation details.

Patterns: `references/testing.md`.

## 7. Review checklist (run before saying "done")

- [ ] Logic lives in the right layer; controller is thin.
- [ ] Statuses/types are enums with transitions enforced in one place.
- [ ] Input validated via FormRequest; `validated()` used.
- [ ] Authorization enforced and tested.
- [ ] Multi-writes in a transaction; jobs/events dispatched after commit.
- [ ] No N+1; lists paginated; needed indexes added in the migration.
- [ ] Migration is reversible (`down()`) and safe on existing data (defaults / nullable / backfill plan).
- [ ] Failure modes handled: retries, idempotency, external timeouts.
- [ ] Feature tests cover happy, forbidden, invalid, and edge cases.
- [ ] Naming reads like the business domain; no dead code, no `dd()`, no commented-out blocks.

## Reference files

Read the one that matches the task — don't load all of them by default.

| File | Read when |
|---|---|
| `references/architecture-patterns.md` | Building a feature end to end; deciding between action/service/repository; DTOs, events, jobs, resources, folder structure |
| `references/enums.md` | Any status, type, role, priority, or state machine |
| `references/integrity-performance-security.md` | Transactions, locking, idempotency, migrations on live data, query performance, security hardening |
| `references/testing.md` | Writing or reviewing tests |
