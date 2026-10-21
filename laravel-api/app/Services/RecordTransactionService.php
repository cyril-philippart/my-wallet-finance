<?php

namespace App\Services;

use App\Exceptions\InsufficientPositionException;
use App\Models\Portfolio;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class RecordTransactionService
{
    public function record(Portfolio $portfolio, array $data): Transaction
    {
        return DB::transaction(function () use ($portfolio, $data): Transaction {
            // Serialise les écritures d'un même portefeuille pour éviter que deux
            // ventes concurrentes ne valident toutes les deux le même solde.
            Portfolio::query()->whereKey($portfolio->getKey())->lockForUpdate()->firstOrFail();

            $nextSequence = ((int) Transaction::query()
                ->where('portfolio_id', $portfolio->getKey())
                ->max('sequence_number')) + 1;

            $occurredAt = CarbonImmutable::parse($data['occurred_at'])
                ->utc()
                ->format('Y-m-d H:i:s');

            $operations = Transaction::query()
                ->where('portfolio_id', $portfolio->getKey())
                ->where('asset_id', $data['asset_id'])
                ->get(['kind', 'quantity', 'occurred_at', 'sequence_number'])
                ->map(fn (Transaction $transaction): array => [
                    'kind' => $transaction->kind,
                    'quantity' => $transaction->quantity,
                    'occurred_at' => $transaction->occurred_at->format('Y-m-d H:i:s'),
                    'sequence_number' => $transaction->sequence_number,
                ])
                ->push([
                    'kind' => $data['kind'],
                    'quantity' => (string) $data['quantity'],
                    'occurred_at' => $occurredAt,
                    'sequence_number' => $nextSequence,
                ])
                ->sortBy([
                    ['occurred_at', 'asc'],
                    ['sequence_number', 'asc'],
                ]);

            $position = '0';

            foreach ($operations as $operation) {
                $signedQuantity = $operation['kind'] === 'BUY'
                    ? (string) $operation['quantity']
                    : bcsub('0', (string) $operation['quantity'], 8);

                $position = bcadd($position, $signedQuantity, 8);

                if (bccomp($position, '0', 8) < 0) {
                    throw new InsufficientPositionException(
                        $portfolio->getKey(),
                        (int) $data['asset_id'],
                        (string) $operation['occurred_at'],
                    );
                }
            }

            return Transaction::query()->create([
                ...$data,
                'occurred_at' => $occurredAt,
                'portfolio_id' => $portfolio->getKey(),
                'sequence_number' => $nextSequence,
            ]);
        });
    }
}
