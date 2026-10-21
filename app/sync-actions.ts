"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../src/server/auth.js";
import { synchronizeGoogleSheetsPrices } from "../src/server/google-sheets-provider.js";
import { captureDailyValuations } from "../src/server/valuation-snapshots.js";
export interface SyncPricesState{status:"idle"|"success"|"error";message?:string;updatedAt?:string;syncedAt?:string;source?:"manual"|"automatic"}
export async function syncPricesAction(_state:SyncPricesState,formData:FormData):Promise<SyncPricesState>{
 const user=await getCurrentUser();if(!user)return{status:"error",message:"Votre session a expiré."};
 const source=formData.get("source")==="automatic"?"automatic":"manual";
 try{const result=await synchronizeGoogleSheetsPrices();await captureDailyValuations(user.id);revalidatePath("/");const now=new Date();return{status:"success",message:`${result.imported} cours actualisé${result.imported>1?"s":""}`,updatedAt:now.toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),syncedAt:now.toISOString(),source};}
 catch(error){const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.message.toLowerCase().includes("timeout"));return{status:"error",message:timeout?"Google Sheets met trop de temps à répondre. Réessayez dans un instant.":"La mise à jour des cours a échoué."};}
}
