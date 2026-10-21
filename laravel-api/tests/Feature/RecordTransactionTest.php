<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\Portfolio;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class RecordTransactionTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_it_records_a_buy_and_a_valid_sale(): void
    {
        [$portfolio, $asset] = $this->portfolioAndAsset();

        $this->record($portfolio, $asset, 'BUY', '10', '2026-01-01')->assertCreated();
        $this->record($portfolio, $asset, 'SELL', '4', '2026-02-01')->assertCreated();

        $this->assertDatabaseCount('transactions', 2);
    }

    public function test_returns_422_when_a_sale_immediately_exceeds_the_position(): void
    {
        [$portfolio, $asset] = $this->portfolioAndAsset();

        $this->record($portfolio, $asset, 'BUY', '10', '2026-01-01')->assertCreated();

        $this->record($portfolio, $asset, 'SELL', '11', '2026-02-01')
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'INSUFFICIENT_POSITION');

        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_returns_422_when_a_backdated_sale_breaks_a_future_position(): void
    {
        [$portfolio, $asset] = $this->portfolioAndAsset();

        $this->record($portfolio, $asset, 'BUY', '10', '2026-01-01')->assertCreated();
        $this->record($portfolio, $asset, 'SELL', '10', '2026-03-01')->assertCreated();

        $this->record($portfolio, $asset, 'SELL', '5', '2026-02-01')
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'INSUFFICIENT_POSITION')
            ->assertJsonPath('error.message', 'Cette vente rendrait la position négative à partir du 2026-03-01 00:00:00.');

        $this->assertDatabaseCount('transactions', 2);
    }

    public function test_it_accepts_a_backdated_sale_when_the_history_stays_valid(): void
    {
        [$portfolio, $asset] = $this->portfolioAndAsset();

        $this->record($portfolio, $asset, 'BUY', '10', '2026-01-01')->assertCreated();
        $this->record($portfolio, $asset, 'SELL', '4', '2026-03-01')->assertCreated();

        $this->record($portfolio, $asset, 'SELL', '5', '2026-02-01')->assertCreated();

        $this->assertDatabaseCount('transactions', 3);
    }

    public function test_returns_422_when_payload_is_invalid(): void
    {
        [$portfolio] = $this->portfolioAndAsset();

        $this->postJson("/api/v1/portfolios/{$portfolio->id}/transactions", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['asset_id', 'kind', 'quantity', 'occurred_at']);

        $this->assertDatabaseCount('transactions', 0);
    }

    /** @return array{Portfolio, Asset} */
    private function portfolioAndAsset(): array
    {
        return [Portfolio::factory()->create(), Asset::factory()->create()];
    }

    private function record(
        Portfolio $portfolio,
        Asset $asset,
        string $kind,
        string $quantity,
        string $date,
    ): TestResponse {
        return $this->postJson("/api/v1/portfolios/{$portfolio->id}/transactions", [
            'asset_id' => $asset->id,
            'kind' => $kind,
            'quantity' => $quantity,
            'occurred_at' => $date,
        ]);
    }
}
