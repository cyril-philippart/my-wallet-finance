import "server-only";
import {database} from "./database.js";

export interface StoredWealthPoint{date:string;value:number;withoutPokemon:number}

async function ensureTable(){await database.query(`CREATE TABLE IF NOT EXISTS daily_wealth_history(user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,day date NOT NULL,value_without_pokemon_eur numeric(20,6) NOT NULL,value_with_pokemon_eur numeric(20,6) NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,day))`);}

export async function saveDailyWealthEvolution(userId:string,withoutPokemonValue:string,withPokemonValue:string):Promise<void>{
  await ensureTable();
  await database.query(`INSERT INTO daily_wealth_history(user_id,day,value_without_pokemon_eur,value_with_pokemon_eur) VALUES($1,current_date,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET value_without_pokemon_eur=excluded.value_without_pokemon_eur,value_with_pokemon_eur=excluded.value_with_pokemon_eur,updated_at=now()`,[userId,withoutPokemonValue,withPokemonValue]);
}

export async function getStoredWealthHistory(userId:string):Promise<StoredWealthPoint[]>{
  await ensureTable();
  const result=await database.query<{date:string;value:string;without_pokemon:string}>(`SELECT day::text date,value_with_pokemon_eur::text value,value_without_pokemon_eur::text without_pokemon FROM daily_wealth_history WHERE user_id=$1 AND day<current_date ORDER BY day`,[userId]);
  return result.rows.map(row=>({date:row.date,value:Number(row.value),withoutPokemon:Number(row.without_pokemon)}));
}
