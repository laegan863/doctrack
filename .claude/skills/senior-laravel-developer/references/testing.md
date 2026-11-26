# Testing

A senior's test suite gives the team confidence to refactor. Prioritize tests that exercise real behavior through public entry points.

## What to test, in order of value

1. **Feature tests per endpoint/command** — HTTP in, response + database state out.
2. **Unit tests for pure domain logic** — enum transitions, calculators, DTO mapping, number generators.
3. **Integration tests for external adapters** — with `Http::fake()` asserting the request sent and handling of failures/timeouts.

## Feature test template (Pest)

```php
use App\Enums\DocumentStatus;
use App\Models\{Document, Unit, User};
use App\Events\DocumentForwarded;
use Illuminate\Support\Facades\Event;

beforeEach(function () {
    $this->fromUnit = Unit::factory()->create();
    $this->toUnit   = Unit::factory()->create();
    $this->user     = User::factory()->for($this->fromUnit)->create();
});

it('forwards a document to another unit', function () {
    Event::fake([DocumentForwarded::class]);
    $document = Document::factory()->heldBy($this->fromUnit)->received()->create();

    $this->actingAs($this->user)
        ->postJson(route('documents.forward', $document), [
            'to_unit_id' => $this->toUnit->id,
            'remarks'    => 'For approval',
        ])
        ->assertOk()
        ->assertJsonPath('data.status.value', DocumentStatus::Forwarded->value);

    expect($document->fresh())
        ->current_unit_id->toBe($this->toUnit->id)
        ->status->toBe(DocumentStatus::Forwarded);

    $this->assertDatabaseHas('document_routes', [
        'document_id'  => $document->id,
        'from_unit_id' => $this->fromUnit->id,
        'to_unit_id'   => $this->toUnit->id,
        'forwarded_by' => $this->user->id,
    ]);

    Event::assertDispatched(DocumentForwarded::class);
});

it('forbids forwarding a document held by another unit', function () {
    $document = Document::factory()->heldBy($this->toUnit)->received()->create();

    $this->actingAs($this->user)
        ->postJson(route('documents.forward', $document), ['to_unit_id' => $this->toUnit->id])
        ->assertForbidden();

    expect($document->fresh()->current_unit_id)->toBe($this->toUnit->id);
});

it('rejects forwarding a completed document', function () {
    $document = Document::factory()->heldBy($this->fromUnit)->completed()->create();

    $this->actingAs($this->user)
        ->postJson(route('documents.forward', $document), ['to_unit_id' => $this->toUnit->id])
        ->assertUnprocessable();
});

it('validates the destination unit', function (array $payload, string $field) {
    $document = Document::factory()->heldBy($this->fromUnit)->received()->create();

    $this->actingAs($this->user)
        ->postJson(route('documents.forward', $document), $payload)
        ->assertJsonValidationErrors($field);
})->with([
    'missing unit'     => [[], 'to_unit_id'],
    'nonexistent unit' => [['to_unit_id' => 999999], 'to_unit_id'],
    'remarks too long' => [['to_unit_id' => 1, 'remarks' => str_repeat('a', 501)], 'remarks'],
]);

it('requires authentication', function () {
    $document = Document::factory()->create();

    $this->postJson(route('documents.forward', $document), [])->assertUnauthorized();
});
```

Every endpoint: **happy path, unauthenticated, forbidden, invalid input, business-rule violation.**

## Factories with states

```php
final class DocumentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'tracking_no'     => fake()->unique()->bothify('DOC-####-????'),
            'title'           => fake()->sentence(4),
            'status'          => DocumentStatus::Received,
            'current_unit_id' => Unit::factory(),
        ];
    }

    public function heldBy(Unit $unit): static
    {
        return $this->state(['current_unit_id' => $unit->id]);
    }

    public function received(): static  { return $this->state(['status' => DocumentStatus::Received]); }
    public function completed(): static { return $this->state(['status' => DocumentStatus::Completed]); }
}
```

States read like the domain and keep tests short.

## Fakes

| Fake | Use to assert |
|---|---|
| `Queue::fake()` | `Queue::assertPushed(GeneratePdf::class, fn ($job) => $job->documentId === $doc->id)` |
| `Event::fake([Specific::class])` | Fake only the events you assert on, so others (model events) still fire |
| `Notification::fake()` | `Notification::assertSentTo($user, DocumentReceived::class)` |
| `Mail::fake()` | `Mail::assertQueued(...)` |
| `Http::fake([...])` | External API responses, including `Http::response(status: 500)` and `ConnectionException` |
| `Storage::fake('private')` | File uploads and generated files |
| `$this->travelTo(...)` | Time-dependent logic (SLAs, overdue) |

## Unit tests for domain logic

```php
it('only allows defined transitions', function (DocumentStatus $from, DocumentStatus $to, bool $allowed) {
    expect($from->canTransitionTo($to))->toBe($allowed);
})->with([
    [DocumentStatus::Received,  DocumentStatus::Forwarded, true],
    [DocumentStatus::Completed, DocumentStatus::Forwarded, false],
    [DocumentStatus::Archived,  DocumentStatus::Received,  false],
]);
```

## Testing actions directly

When an action is called from multiple entry points (HTTP, CLI, job), test it directly too:

```php
it('throws on illegal transition', function () {
    $doc = Document::factory()->completed()->create();

    app(ForwardDocumentAction::class)->execute($doc, new ForwardDocumentData(toUnitId: 2, remarks: null), User::factory()->create());
})->throws(InvalidStatusTransition::class);
```

## Principles

- `RefreshDatabase` (or `LazilyRefreshDatabase`) — every test starts clean. Prefer the same DB engine as production for anything engine-specific (JSON, full-text, locking).
- Assert outcomes (rows, responses, dispatched jobs), not which internal methods were called. Mock only at system boundaries (HTTP, SMS, payment).
- One behavior per test; the test name is a sentence describing the rule.
- A bug fix starts with a failing test that reproduces it.
- Keep tests fast: no real network, no sleeps, minimal seeding.
- Architecture tests (Pest `arch()`) can enforce rules: controllers don't use `DB`, no `dd`/`dump`, enums are backed, actions are final.

```php
arch('no debugging calls')->expect(['dd', 'dump', 'ray', 'var_dump'])->not->toBeUsed();
arch('controllers stay thin')->expect('App\Http\Controllers')->not->toUse('Illuminate\Support\Facades\DB');
arch('actions are final')->expect('App\Actions')->classes()->toBeFinal();
arch('enums are backed')->expect('App\Enums')->toBeStringBackedEnums();
```
