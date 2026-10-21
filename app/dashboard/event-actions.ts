"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "../../src/server/auth.js";
import {database} from "../../src/server/database.js";
import {ensureWealthEventsTable} from "../../src/server/wealth-events.js";

export interface EventState{status:"idle"|"success"|"error";message?:string}
const schema=z.object({id:z.string().uuid().optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),title:z.string().trim().min(2).max(120),description:z.string().trim().max(500),type:z.enum(["MARKET","NEWS","POKEMON","NOTE"])});

export async function createWealthEventAction(_state:EventState,formData:FormData):Promise<EventState>{
  const user=await getCurrentUser();
  if(!user)return{status:"error",message:"Session expirée."};
  const rawId=String(formData.get("id")??"").trim();
  const parsed=schema.safeParse({id:rawId||undefined,date:formData.get("date"),title:formData.get("title"),description:formData.get("description")??"",type:formData.get("type")});
  if(!parsed.success)return{status:"error",message:"Vérifie la date et le titre."};
  await ensureWealthEventsTable();
  if(parsed.data.id){
    await database.query(`UPDATE wealth_events SET event_day=$1,title=$2,description=$3,event_type=$4 WHERE id=$5 AND user_id=$6`,[parsed.data.date,parsed.data.title,parsed.data.description||null,parsed.data.type,parsed.data.id,user.id]);
  }else{
    await database.query(`INSERT INTO wealth_events(user_id,event_day,title,description,event_type) VALUES($1,$2,$3,$4,$5)`,[user.id,parsed.data.date,parsed.data.title,parsed.data.description||null,parsed.data.type]);
  }
  revalidatePath("/");
  return{status:"success"};
}

export async function deleteWealthEventAction(id:string):Promise<void>{const user=await getCurrentUser();if(!user)return;await ensureWealthEventsTable();await database.query(`DELETE FROM wealth_events WHERE id=$1 AND user_id=$2`,[id,user.id]);revalidatePath("/");}
