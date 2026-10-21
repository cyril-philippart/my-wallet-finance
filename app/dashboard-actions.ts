"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "../src/server/auth.js";
import { database } from "../src/server/database.js";

export interface CapitalState { status:"idle"|"success"|"error"; message?:string }

const capitalSchema=z.coerce.number().finite().min(0).max(999_999_999);

export async function saveAvailableCapitalAction(_state:CapitalState,formData:FormData):Promise<CapitalState>{
  const user=await getCurrentUser();
  if(!user)return{status:"error",message:"Votre session a expiré."};
  const parsed=capitalSchema.safeParse(String(formData.get("availableCapital")??"").replace(",","."));
  if(!parsed.success)return{status:"error",message:"Saisissez un montant positif."};
  await database.query(
    `INSERT INTO app_preferences(user_id,available_capital_eur) VALUES($1,$2)
     ON CONFLICT(user_id) DO UPDATE SET available_capital_eur=excluded.available_capital_eur,updated_at=now()`,
    [user.id,parsed.data],
  );
  revalidatePath("/");
  return{status:"success",message:"Capital disponible enregistré."};
}
