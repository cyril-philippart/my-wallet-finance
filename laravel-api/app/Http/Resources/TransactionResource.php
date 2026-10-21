<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransactionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'portfolio_id' => $this->portfolio_id,
            'asset_id' => $this->asset_id,
            'kind' => $this->kind,
            'quantity' => $this->quantity,
            'occurred_at' => $this->occurred_at->toISOString(),
        ];
    }
}
