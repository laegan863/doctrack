# Enums — Proper Integration

PHP 8.1+ backed enums are the single source of truth for any fixed set of values: statuses, types, roles, priorities, channels. Done well, they remove magic strings, centralize business rules, and keep backend and frontend in sync.

## 1. Anatomy of a well-built enum

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum DocumentStatus: string
{
    case Draft      = 'draft';
    case Received   = 'received';
    case InProgress = 'in_progress';
    case Forwarded  = 'forwarded';
    case Completed  = 'completed';
    case Archived   = 'archived';

    // --- Presentation -------------------------------------------------

    public function label(): string
    {
        return match ($this) {
            self::Draft      => 'Draft',
            self::Received   => 'Received',
            self::InProgress => 'In Progress',
            self::Forwarded  => 'Forwarded',
            self::Completed  => 'Completed',
            self::Archived   => 'Archived',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Draft      => 'gray',
            self::Received   => 'blue',
            self::InProgress => 'amber',
            self::Forwarded  => 'violet',
            self::Completed  => 'green',
            self::Archived   => 'slate',
        };
    }

    // --- State machine ------------------------------------------------

    /** @return list<self> */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Draft      => [self::Received],
            self::Received   => [self::InProgress, self::Forwarded, self::Completed],
            self::InProgress => [self::Forwarded, self::Completed],
            self::Forwarded  => [self::Received],
            self::Completed  => [self::Archived],
            self::Archived   => [],
        };
    }

    public function canTransitionTo(self $next): bool
    {
        return in_array($next, $this->allowedTransitions(), true);
    }

    public function isFinal(): bool
    {
        return $this->allowedTransitions() === [];
    }

    // --- Grouping helpers ---------------------------------------------

    /** Statuses that count as "open work" for dashboards and overdue checks. */
    public static function active(): array
    {
        return [self::Received, self::InProgress, self::Forwarded];
    }

    // --- Serialization ------------------------------------------------

    /** For dropdowns / frontend: [['value' => 'draft', 'label' => 'Draft'], ...] */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => ['value' => $case->value, 'label' => $case->label()],
            self::cases(),
        );
    }
}
```

Why `match` without a `default`: if someone adds a new case and forgets to handle it, PHP throws `UnhandledMatchError` immediately in tests instead of silently returning a wrong value.

## 2. Database & migrations

```php
$table->string('status', 32)->default(DocumentStatus::Draft->value)->index();
```

- Use a `string` column, **not** the MySQL `enum` type. Adding a case then needs zero migrations.
- Index it if you filter by it.
- Case values are a **storage contract**. Renaming a case's *name* is free; changing its *value* requires a data migration.

## 3. Model casting

```php
protected function casts(): array
{
    return [
        'status'   => DocumentStatus::class,
        'priority' => Priority::class,
        'channels' => AsEnumCollection::of(NotificationChannel::class),  // JSON array of enums
    ];
}
```

Now `$document->status` is a `DocumentStatus` instance, comparisons are type-safe:

```php
if ($document->status === DocumentStatus::Completed) { ... }        // ✅
if ($document->status === 'completed') { ... }                       // ❌ always false — it's an object
```

Querying accepts the enum directly:

```php
Document::where('status', DocumentStatus::Received)->get();
Document::whereIn('status', DocumentStatus::active())->count();
```

## 4. Validation

```php
use Illuminate\Validation\Rule;

'status'   => ['required', Rule::enum(DocumentStatus::class)],
'priority' => ['required', Rule::enum(Priority::class)->except([Priority::Critical])],  // restrict subset
```

Then convert in the DTO: `DocumentStatus::from($validated['status'])`. Use `tryFrom()` only when null-on-invalid is genuinely acceptable.

## 5. Enforcing transitions in ONE place

The enum *defines* the rules; the action *enforces* them. Never scatter `if ($status === ...)` checks across controllers.

```php
final class ChangeDocumentStatusAction
{
    public function execute(Document $document, DocumentStatus $next, User $actor): Document
    {
        if (! $document->status->canTransitionTo($next)) {
            throw InvalidStatusTransition::make($document->status, $next);
        }

        return DB::transaction(function () use ($document, $next, $actor) {
            $previous = $document->status;
            $document->update(['status' => $next]);
            $document->statusLogs()->create([
                'from' => $previous, 'to' => $next, 'changed_by' => $actor->id,
            ]);
            return $document;
        });
    }
}
```

For extra safety against concurrent changes, make the update conditional:

```php
$updated = Document::whereKey($document->id)
    ->where('status', $previous)          // only if nobody changed it meanwhile
    ->update(['status' => $next]);

if ($updated === 0) {
    throw new ConcurrentModification();
}
```

## 6. Enums with interfaces and attributes

Shared contracts let generic UI code handle any enum:

```php
interface HasLabel { public function label(): string; }

enum Priority: string implements HasLabel
{
    case Low = 'low'; case Normal = 'normal'; case High = 'high'; case Critical = 'critical';

    public function label(): string { return ucfirst($this->value); }

    public function slaHours(): int
    {
        return match ($this) {
            self::Critical => 4, self::High => 24, self::Normal => 72, self::Low => 168,
        };
    }
}
```

Business constants tied to a case (SLA hours, permission sets, icon names) belong on the enum, not in a config file far away.

## 7. Roles & permissions via enum

```php
enum Role: string
{
    case Admin = 'admin'; case UnitHead = 'unit_head'; case Staff = 'staff';

    /** @return list<Permission> */
    public function permissions(): array
    {
        return match ($this) {
            self::Admin    => Permission::cases(),
            self::UnitHead => [Permission::ViewDocuments, Permission::ForwardDocuments, Permission::ApproveDocuments],
            self::Staff    => [Permission::ViewDocuments, Permission::ForwardDocuments],
        };
    }

    public function can(Permission $permission): bool
    {
        return in_array($permission, $this->permissions(), true);
    }
}
```

Policies then read cleanly: `return $user->role->can(Permission::ApproveDocuments) && $document->isHeldBy($user->unit_id);`

## 8. Exposing to the frontend

- In API resources output `['value' => ..., 'label' => ..., 'color' => ...]`.
- Provide an endpoint or shared prop with `DocumentStatus::options()` for dropdowns.
- The frontend never hardcodes labels or the transition list — ask the backend (e.g. include `allowed_transitions` in the resource).

## 9. Factories & tests

```php
// Factory state
public function completed(): static
{
    return $this->state(['status' => DocumentStatus::Completed]);
}

// Unit test the state machine exhaustively
it('never allows leaving a final status', function (DocumentStatus $status) {
    foreach (DocumentStatus::cases() as $next) {
        expect($status->canTransitionTo($next))->toBeFalse();
    }
})->with(fn () => array_filter(DocumentStatus::cases(), fn ($s) => $s->isFinal()));
```

## 10. Enum vs lookup table — choose deliberately

| Use an **enum** when | Use a **database table** when |
|---|---|
| Values change only with code deploys | Admins add/edit values at runtime (e.g. document types, divisions) |
| Code branches on specific values | Code never branches on a specific value |
| Behavior is attached (transitions, SLA) | Values carry user-editable metadata |

Hybrid is fine: a `document_types` table managed by admins, with a `category` column cast to an enum the code branches on.

## Anti-patterns

- Class constants (`const STATUS_DONE = 'done'`) instead of enums.
- Comparing `$model->status->value === 'done'` — compare enum instances.
- Labels duplicated in Blade/JS.
- `default =>` arms in `match` that hide unhandled new cases.
- DB `ENUM` column type.
- Transition checks spread across controllers, views, and jobs.
