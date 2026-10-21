import "server-only";
import {database} from "./database.js";

export type WealthEventType="MARKET"|"NEWS"|"POKEMON"|"NOTE";
export interface WealthEvent{id:string;date:string;title:string;description:string|null;type:WealthEventType}

export async function ensureWealthEventsTable(){await database.query(`CREATE TABLE IF NOT EXISTS wealth_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,event_day date NOT NULL,title varchar(120) NOT NULL,description text,event_type varchar(20) NOT NULL CHECK(event_type IN('MARKET','NEWS','POKEMON','NOTE')),created_at timestamptz NOT NULL DEFAULT now())`);}
export async function getWealthEvents(userId:string):Promise<WealthEvent[]>{await ensureWealthEventsTable();const result=await database.query<{id:string;date:string;title:string;description:string|null;type:WealthEventType}>(`SELECT id,event_day::text date,title,description,event_type type FROM wealth_events WHERE user_id=$1 ORDER BY event_day,id`,[userId]);return result.rows;}
