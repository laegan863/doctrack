# Architecture Patterns — End-to-End Feature

This file walks one realistic feature through every layer so the integration between enums, DTOs, actions, services, repositories, policies, events, jobs, and resources is concrete.

**Feature:** "Forward a document to another unit." Rules:
- Only the unit currently holding the document can forward it.
- Only documents in `Received` or `InProgress` status can be forwarded.
- Forwarding records a routing history entry, changes the holder, sets status to `Forwarded`, and notifies the receiving unit's users.

## Folder structure

Organize by type for small/medium apps; group by domain once the app has several clear bounded areas.

```
app/
├── Actions/Documents/ForwardDocumentAction.php
├── Data/Documents/ForwardDocumentData.php         # DTOs
├── Enums/DocumentStatus.php
├── Events/DocumentForwarded.php
├── Exceptions/Documents/InvalidStatusTransition.php
├── Http/
│   ├── Controllers/DocumentForwardController.php
│   ├── Requests/ForwardDocumentRequest.php
│   └── Resources/DocumentResource.php
├── Jobs/
├── Listeners/NotifyReceivingUnit.php
├── Models/Document.php
├── Policies/DocumentPolicy.php
├── Queries/Documents/IncomingDocumentsQuery.php   # query objects
├── Repositories/                                  # only when justified
└── Services/DocumentNumberGenerator.php
```

Domain-grouped alternative for larger systems: `app/Domain/Documents/{Actions,Data,Enums,Events,Models,...}` with HTTP kept in `app/Http`.

## 1. Migration — model the data and invariants first

```php
Schema::create('document_routes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('document_id')->constrained()->cascadeOnDelete();
    $table->foreignId('from_unit_id')->constrained('units')->restrictOnDelete();
    $table->foreignId('to_unit_id')->constrained('units')->restrictOnDelete();
    $table->foreignId('forwarded_by')->constrained('users')->restrictOnDelete();
    $table->string('remarks', 500)->nullable();
    $table->timestamps();

    $table->index(['to_unit_id', 'created_at']);   // matches "incoming for my unit, newest first"
});
```

Why `restrictOnDelete` for units/users: routing history is an audit trail — deleting a unit must not silently erase it.

## 2. Enum (see enums.md for the full pattern)

```php
enum DocumentStatus: string
{
    case Received   = 'received';
    case InProgress = 'in_progress';
    case Forwarded  = 'forwarded';
    case Completed  = 'completed';

    public function canTransitionTo(self $next): bool
    {
        return in_array($next, $this->allowedTransitions(), true);
    }

    /** @return list<self> */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Received, self::InProgress => [self::InProgress, self::Forwarded, self::Completed],
            self::Forwarded                  => [self::Received],
            self::Completed                  => [],
        };
    }
}
```

## 3. Model — relationships, casts, scopes; no workflows

```php
final class Document extends Model
{
    use HasFactory;

    protected $fillable = ['title', 'tracking_no', 'document_type_id', 'current_unit_id', 'status'];

    protected function casts(): array
    {
        return [
            'status' => DocumentStatus::class,
        ];
    }

    public function currentUnit(): BelongsTo
    {
        return $this->belongsTo(Unit::class, 'current_unit_id');
    }

    public function routes(): HasMany
    {
        return $this->hasMany(DocumentRoute::class)->latest();
    }

    public function scopeHeldBy(Builder $query, int $unitId): void
    {
        $query->where('current_unit_id', $unitId);
    }

    public function isHeldBy(Unit|int $unit): bool
    {
        return $this->current_unit_id === ($unit instanceof Unit ? $unit->id : $unit);
    }
}
```

Simple self-describing predicates (`isHeldBy`) belong on the model. "Forward this document" does not — it touches several models and has side effects.

## 4. FormRequest — validate and normalize

```php
final class ForwardDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('forward', $this->route('document'));
    }

    public function rules(): array
    {
        return [
            'to_unit_id' => ['required', 'integer', Rule::exists('units', 'id')->where('is_active', true)],
            'remarks'    => ['nullable', 'string', 'max:500'],
        ];
    }

    public function toData(): ForwardDocumentData
    {
        return ForwardDocumentData::fromRequest($this);
    }
}
```

## 5. DTO — typed, immutable input

```php
final readonly class ForwardDocumentData
{
    public function __construct(
        public int $toUnitId,
        public ?string $remarks,
    ) {}

    public static function fromRequest(ForwardDocumentRequest $request): self
    {
        $v = $request->validated();

        return new self(
            toUnitId: (int) $v['to_unit_id'],
            remarks: $v['remarks'] ?? null,
        );
    }
}
```

Why a DTO instead of passing an array: the action's signature documents exactly what it needs, typos become errors, and the action can be called from a console command, job, or test without a `Request`.

## 6. Policy — who may do it

```php
final class DocumentPolicy
{
    public function forward(User $user, Document $document): bool
    {
        return $document->isHeldBy($user->unit_id);
    }
}
```

Policy answers *who*. The action enforces *state* rules (status transition). Keep them separate: a forbidden user gets 403; an illegal transition gets 422.

## 7. Action — the business operation

```php
final class ForwardDocumentAction
{
    public function __construct(
        private readonly DatabaseManager $db,
    ) {}

    public function execute(Document $document, ForwardDocumentData $data, User $actor): Document
    {
        if (! $document->status->canTransitionTo(DocumentStatus::Forwarded)) {
            throw InvalidStatusTransition::make($document->status, DocumentStatus::Forwarded);
        }

        if ($data->toUnitId === $document->current_unit_id) {
            throw new DomainException('Cannot forward a document to its current unit.');
        }

        return $this->db->transaction(function () use ($document, $data, $actor) {
            // Re-read with a lock so two people forwarding at once can't both succeed.
            $document = Document::query()->lockForUpdate()->findOrFail($document->id);

            $fromUnitId = $document->current_unit_id;

            $document->routes()->create([
                'from_unit_id' => $fromUnitId,
                'to_unit_id'   => $data->toUnitId,
                'forwarded_by' => $actor->id,
                'remarks'      => $data->remarks,
            ]);

            $document->update([
                'current_unit_id' => $data->toUnitId,
                'status'          => DocumentStatus::Forwarded,
            ]);

            DocumentForwarded::dispatch($document, $fromUnitId, $actor->id);

            return $document;
        });
    }
}
```

Note: the event is dispatched inside the transaction, so the event class implements `ShouldDispatchAfterCommit` — listeners only run if the transaction commits.

## 8. Controller — thin HTTP adapter

```php
final class DocumentForwardController
{
    public function __invoke(
        ForwardDocumentRequest $request,
        Document $document,
        ForwardDocumentAction $forward,
    ): DocumentResource {
        $document = $forward->execute($document, $request->toData(), $request->user());

        return DocumentResource::make($document->load('currentUnit'));
    }
}
```

Invokable controllers are great for single-purpose endpoints. Resource controllers (`index/store/show/update/destroy`) for standard CRUD.

## 9. Domain exception → HTTP mapping

```php
final class InvalidStatusTransition extends DomainException
{
    public static function make(DocumentStatus $from, DocumentStatus $to): self
    {
        return new self("Cannot change status from {$from->label()} to {$to->label()}.");
    }
}

// bootstrap/app.php
->withExceptions(function (Exceptions $exceptions) {
    $exceptions->render(fn (InvalidStatusTransition $e) =>
        response()->json(['message' => $e->getMessage()], 422)
    );
})
```

Domain code throws meaningful exceptions; only the edge decides HTTP status codes.

## 10. Event, listener, job — side effects

```php
final class DocumentForwarded implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Document $document,
        public readonly int $fromUnitId,
        public readonly int $actorId,
    ) {}
}

final class NotifyReceivingUnit implements ShouldQueue
{
    public int $tries = 3;
    public array $backoff = [10, 60, 300];

    public function handle(DocumentForwarded $event): void
    {
        $users = User::query()->where('unit_id', $event->document->current_unit_id)->get();

        Notification::send($users, new DocumentReceivedNotification($event->document));
    }
}
```

Notification failure must not roll back the forward — so it's an event + queued listener, not a direct call in the transaction.

## 11. API Resource — response shape

```php
final class DocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'tracking_no' => $this->tracking_no,
            'title'       => $this->title,
            'status'      => [
                'value' => $this->status->value,
                'label' => $this->status->label(),
                'color' => $this->status->color(),
            ],
            'current_unit' => UnitResource::make($this->whenLoaded('currentUnit')),
            'can'          => [
                'forward' => $request->user()?->can('forward', $this->resource) ?? false,
            ],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
```

`whenLoaded` prevents the resource from silently triggering N+1 queries.

---

## Service pattern (cohesive operations / integration wrapper)

Use a service when operations share configuration or state, or wrap an external system.

```php
final class DocumentNumberGenerator
{
    public function __construct(private readonly DatabaseManager $db) {}

    /** Generates e.g. "HR-2026-000123", gap-free per prefix per year. */
    public function next(string $prefix): string
    {
        return $this->db->transaction(function () use ($prefix) {
            $year = now()->year;

            $seq = DocumentSequence::query()
                ->where(['prefix' => $prefix, 'year' => $year])
                ->lockForUpdate()
                ->first()
                ?? DocumentSequence::create(['prefix' => $prefix, 'year' => $year, 'last' => 0]);

            $seq->increment('last');

            return sprintf('%s-%d-%06d', $prefix, $year, $seq->last);
        });
    }
}
```

### External integration with an interface

```php
interface SmsGateway
{
    public function send(string $to, string $message): void;
}

final class SemaphoreSmsGateway implements SmsGateway { /* Http::timeout(5)->retry(2, 200)->post(...) */ }
final class LogSmsGateway implements SmsGateway { /* writes to log for local/testing */ }

// AppServiceProvider::register()
$this->app->bind(SmsGateway::class, fn () => match (config('services.sms.driver')) {
    'semaphore' => new SemaphoreSmsGateway(config('services.sms.key')),
    default     => new LogSmsGateway(),
});
```

This is where an interface earns its keep: real implementations differ per environment.

---

## Repository pattern — done right (when justified)

Bad (pure ceremony):

```php
class UserRepository {
    public function find($id) { return User::find($id); }
    public function all() { return User::all(); }
}
```

Good — encapsulates a real, reused, non-trivial read model:

```php
final class DocumentRepository
{
    /** Incoming documents for a unit, with everything the inbox screen needs. */
    public function inboxFor(int $unitId, ?DocumentStatus $status = null, int $perPage = 20): LengthAwarePaginator
    {
        return Document::query()
            ->select(['id', 'tracking_no', 'title', 'status', 'document_type_id', 'current_unit_id', 'updated_at'])
            ->heldBy($unitId)
            ->when($status, fn (Builder $q) => $q->where('status', $status))
            ->with(['type:id,name', 'routes' => fn ($q) => $q->latest()->limit(1)])
            ->withCount('attachments')
            ->latest('updated_at')
            ->paginate($perPage);
    }

    public function overdueCount(int $unitId, CarbonInterface $before): int
    {
        return Document::query()
            ->heldBy($unitId)
            ->whereIn('status', [DocumentStatus::Received, DocumentStatus::InProgress])
            ->where('updated_at', '<', $before)
            ->count();
    }
}
```

Rules for repositories:
- Return models, collections, paginators, or DTOs — never query builders (that leaks the abstraction).
- Name methods after the business question (`inboxFor`, `overdueCount`), not SQL (`getWhereStatusAndUnit`).
- Writes usually stay in actions via Eloquent; repositories are most valuable for **reads**.
- Only add an interface for the repository if you genuinely have a second implementation.

### Query object alternative

For one complex query used in one or two places, a query object is lighter than a repository:

```php
final class IncomingDocumentsQuery
{
    public function __invoke(int $unitId): Builder
    {
        return Document::query()->heldBy($unitId)->with('type')->latest();
    }
}
```

---

## Jobs — design for retries

```php
final class GenerateDocumentPdf implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $tries = 5;
    public int $timeout = 120;

    public function __construct(public readonly int $documentId) {}

    public function uniqueId(): string { return (string) $this->documentId; }

    public function backoff(): array { return [5, 30, 120]; }

    public function handle(PdfRenderer $renderer): void
    {
        $document = Document::find($this->documentId);
        if (! $document) {
            return;                       // deleted meanwhile — nothing to do, don't fail
        }

        if ($document->pdf_path && Storage::exists($document->pdf_path)) {
            return;                       // idempotent: already done by a previous attempt
        }

        $path = $renderer->render($document);
        $document->update(['pdf_path' => $path]);
    }

    public function failed(Throwable $e): void
    {
        Log::error('PDF generation failed', ['document_id' => $this->documentId, 'error' => $e->getMessage()]);
    }
}
```

Pass IDs (or models with `SerializesModels`) — never large payloads. Every job should be safe to run twice.

---

## Anti-patterns to refuse

- Fat controllers with queries, transactions, and notifications inline.
- "Helper" / "Manager" / "Util" classes that collect unrelated functions.
- Services that receive `Request` objects.
- Static service methods (`DocumentService::forward()`) — untestable, hide dependencies.
- Observers carrying core business logic (invisible control flow). Use them for small model-level concerns like setting a UUID or slug.
- Returning arrays with mixed shapes from services — return models or DTOs.
- Catching `Exception` and returning `false`.
- Repositories that wrap every Eloquent method 1:1.
