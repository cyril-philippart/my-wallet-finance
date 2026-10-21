<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class InsufficientPositionException extends Exception
{
    public function __construct(
        public readonly int $portfolioId,
        public readonly int $assetId,
        public readonly string $firstNegativePositionAt,
    ) {
        parent::__construct('The transaction would make the position negative.');
    }

    public function report(): void
    {
        Log::warning('transaction.rejected', [
            'reason' => 'insufficient_position',
            'portfolio_id' => $this->portfolioId,
            'asset_id' => $this->assetId,
            'first_negative_position_at' => $this->firstNegativePositionAt,
        ]);
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'INSUFFICIENT_POSITION',
                'message' => "Cette vente rendrait la position négative à partir du {$this->firstNegativePositionAt}.",
            ],
        ], 422);
    }
}
