<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'asset_id' => ['required', 'integer', 'exists:assets,id'],
            'kind' => ['required', Rule::in(['BUY', 'SELL'])],
            'quantity' => ['required', 'numeric', 'gt:0', 'decimal:0,8'],
            'occurred_at' => ['required', 'date'],
        ];
    }
}
