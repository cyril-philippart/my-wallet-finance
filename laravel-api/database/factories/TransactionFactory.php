<?php

namespace Database\Factories;

use App\Models\Asset;
use App\Models\Portfolio;
use App\Models\Transaction;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Transaction> */
class TransactionFactory extends Factory
{
    protected $model = Transaction::class;

    public function definition(): array
    {
        return [
            'portfolio_id' => Portfolio::factory(),
            'asset_id' => Asset::factory(),
            'kind' => 'BUY',
            'quantity' => '1',
            'occurred_at' => fake()->dateTime(),
            'sequence_number' => 1,
        ];
    }
}
