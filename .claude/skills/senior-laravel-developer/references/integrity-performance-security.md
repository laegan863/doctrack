# Data Integrity, Performance & Security

## Part A — Data integrity

### Transactions

```php
DB::transaction(function () use (...) {
    // all writes that must succeed or fail together
}, attempts: 3);   // retries on deadlock
```

- Transactions belong in actions/services — the unit that knows what "one operation" means.
- Keep them **short**: no HTTP calls, no file uploads, no emails inside. Do slow I/O before (prepare) or after (dispatch after commit).
- Nested `DB::transaction` calls become savepoints — safe, but a sign the boundary may be unclear.

### Dispatch after commit

A job dispatched inside a transaction can run before the commit, find no row, and fail.

```php
ProcessDocument::dispatch($document->id)->afterCommit();
// or set 'after_commit' => true on the queue connection
// or implement ShouldDispatchAfterCommit on events / ShouldQueueAfterCommit on listeners
```

### Concurrency

| Problem | Tool |
|---|---|
| Two users update the same row (lost update) | `lockForUpdate()` inside a transaction, or optimistic locking with a `version` column / conditional `where` |
| Counters, balances | `increment()` / `decrement()` (atomic SQL), never read-modify-write in PHP |
| "Only one may claim this" | `UPDATE ... WHERE claimed_by IS NULL` and check affected rows |
| Unique business key | Database unique index + catch `UniqueConstraintViolationException` |
| Same job/command running twice | `ShouldBeUnique`, `WithoutOverlapping` middleware, `Cache::lock()` |
| Duplicate form submits / API retries | Idempotency key stored with a unique index |

```php
// Idempotent create using a client-supplied key
try {
    return Payment::create([...$data, 'idempotency_key' => $key]);
} catch (UniqueConstraintViolationException) {
    return Payment::where('idempotency_key', $key)->firstOrFail();
}
```

### Migrations on live data

- Every migration has a working `down()` unless it's knowingly irreversible (say so in a comment).
- Adding a NOT NULL column to a populated table: add nullable → backfill (chunked) → make NOT NULL, or provide a default.
- Never edit a migration that has run in any shared environment; write a new one.
- Large backfills go in a queued job or artisan command with `chunkById`, not in the migration.
- Renaming/dropping columns used by running code: deploy in two steps (stop using → then drop).
- Foreign keys: decide `cascadeOnDelete` vs `restrictOnDelete` vs `nullOnDelete` on purpose. Audit/history tables almost always `restrict`.
- Soft deletes (`SoftDeletes`) for records users may need restored or that are referenced by history; remember unique indexes must account for soft-deleted rows.

### Money, time, identifiers

- Money: integer minor units (centavos) or `decimal(15,2)` with `decimal:2` cast — never `float`.
- Time: store UTC; convert at the edge for display. Use `CarbonImmutable` (`Date::use(CarbonImmutable::class)`) to avoid accidental mutation.
- Public identifiers: use ULIDs/UUIDs (`HasUlids`) or opaque tracking numbers for URLs if sequential IDs leak business info.

---

## Part B — Performance

### N+1 prevention

```php
// AppServiceProvider::boot()
Model::preventLazyLoading(! app()->isProduction());
Model::preventSilentlyDiscardingAttributes(! app()->isProduction());
```

```php
$documents = Document::with(['type:id,name', 'currentUnit:id,name'])
    ->withCount('attachments')
    ->withMax('routes', 'created_at')
    ->paginate(20);
```

- Constrain eager loads with columns (`relation:id,name`) — the foreign key and `id` must be included.
- `withCount` / `withSum` / `withExists` instead of loading relations to aggregate.
- `whereHas` can be slow on large tables; consider `whereIn` with a subquery or a join for hot paths.

### Large datasets

```php
Document::where('status', DocumentStatus::Archived)
    ->chunkById(500, function ($docs) { /* ... */ });

foreach (Document::lazyById(1000) as $doc) { /* constant memory */ }

Document::where('updated_at', '<', now()->subYear())->update([...]);   // set-based, no models loaded
```

Never `Model::all()` on a table that grows. Never `->get()->count()` — use `->count()`.

### Indexes

- Index foreign keys, filter columns, and sort columns.
- Composite index order follows the query: equality columns first, then range/sort (`['current_unit_id', 'status', 'updated_at']`).
- Check with `EXPLAIN` (or `->explain()`) for queries on big tables.
- `LIKE '%term%'` cannot use a B-tree index — use full-text indexes or a search engine (Scout).

### Caching

- Cache expensive, read-heavy, rarely-changing data (`Cache::remember`, `Cache::flexible` for stale-while-revalidate).
- Key carefully (include tenant/unit/user where data differs) and invalidate on write (in the action or via model events).
- Production deploy: `php artisan optimize` (config, routes, events, views cached).

### Queues

- Push slow work to queues; run workers under Supervisor/Horizon.
- Separate queues by priority (`high`, `default`, `low`) so bulk work doesn't starve user-facing jobs.
- Set `$timeout` lower than the queue's `retry_after`.

---

## Part C — Security

### Authorization

- Policies for every model with user-facing actions; register automatically by naming convention.
- Authorize in controllers (`Gate::authorize('update', $doc)`) or FormRequest `authorize()` — and **test the 403 case**.
- Scope list queries at the query level: `Document::heldBy($user->unit_id)`, or a global scope for tenancy. Filtering a collection after loading leaks data via counts and pagination.
- Route-model binding + `scopeBindings()` for nested resources (`/units/{unit}/documents/{document}` ensures the document belongs to the unit).

### Input & output

- `$request->validated()` / `$request->safe()->only([...])` — never `$request->all()` into `create()`.
- Explicit `$fillable`; never let users set `role`, `is_admin`, `unit_id`, `status` unless the endpoint is meant for that.
- Blade `{{ }}` escapes; `{!! !!}` only for trusted, sanitized HTML.
- API resources whitelist fields; `$hidden` for password, tokens, internal flags.

### SQL

- Query builder/Eloquent bind parameters automatically.
- `whereRaw`/`DB::raw`/`orderByRaw` with user input → use bindings (`whereRaw('LOWER(name) = ?', [$x])`).
- User-chosen sort columns: whitelist (`in:title,created_at`) before passing to `orderBy`.

### Files

```php
'file' => ['required', 'file', 'mimes:pdf,docx,jpg,png', 'max:10240'],
```

- Store on a private disk; serve through a controller that authorizes, or a temporary signed URL.
- Generate your own filenames (`$file->store(...)`); never trust the client filename for paths.

### Auth & sessions

- Hash with `Hash::make` (bcrypt/argon); never store reversible passwords.
- Rate-limit login, password reset, OTP, and expensive endpoints (`RateLimiter::for(...)`, `throttle` middleware).
- Regenerate session on login; invalidate on logout.
- Sanctum for SPA/mobile tokens with abilities scoped to need.

### Secrets & logging

- Secrets only in `.env` / secret manager; `.env` never committed.
- Don't log passwords, tokens, full card numbers, or entire request bodies. Use context arrays with IDs.
- `APP_DEBUG=false` in production, always.

### Audit trail

For systems of record (document tracking, finance, HR): record who did what, when, from/to which value — in an append-only table written in the same transaction as the change.
