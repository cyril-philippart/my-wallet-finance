<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('portfolios', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('assets', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('symbol')->unique();
            $table->timestamps();
        });

        Schema::create('transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('portfolio_id')->constrained()->cascadeOnDelete();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 4);
            $table->decimal('quantity', 20, 8);
            $table->dateTime('occurred_at');
            $table->unsignedBigInteger('sequence_number');
            $table->timestamps();

            $table->index(['portfolio_id', 'asset_id', 'occurred_at']);
            $table->unique(['portfolio_id', 'sequence_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
        Schema::dropIfExists('assets');
        Schema::dropIfExists('portfolios');
    }
};
