<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTransactionRequest;
use App\Http\Resources\TransactionResource;
use App\Models\Portfolio;
use App\Services\RecordTransactionService;
use Illuminate\Http\JsonResponse;

class TransactionController extends Controller
{
    public function store(
        StoreTransactionRequest $request,
        Portfolio $portfolio,
        RecordTransactionService $service,
    ): JsonResponse {
        $transaction = $service->record($portfolio, $request->validated());

        return (new TransactionResource($transaction))
            ->response()
            ->setStatusCode(201);
    }
}
