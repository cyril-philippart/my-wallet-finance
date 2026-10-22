import {database} from "../../../src/server/database.js";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    await database.query("SELECT 1");
    return Response.json({status:"ok"});
  }catch{
    return Response.json({status:"unavailable"},{status:503});
  }
}

