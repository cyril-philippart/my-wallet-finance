<?php

use App\Http\Controllers\TransactionController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::post('/portfolios/{portfolio}/transactions', [TransactionController::class, 'store'])
        ->name('api.v1.portfolios.transactions.store');
});
