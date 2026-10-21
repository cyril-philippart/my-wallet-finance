import { redirect } from "next/navigation";
import { getCurrentUser } from "../src/server/auth.js";
import Dashboard from "./dashboard/dashboard-client";
import { getDashboardData } from "../src/server/portfolio-queries.js";
import { getPokemonSummary } from "../src/server/zebradex-provider.js";
import {getStoredWealthHistory} from "../src/server/wealth-history.js";
import {getWealthEvents} from "../src/server/wealth-events.js";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [data,pokemon,wealthHistory,wealthEvents] = await Promise.all([getDashboardData(user.id),getPokemonSummary(),getStoredWealthHistory(user.id),getWealthEvents(user.id)]);
  const priceSyncConfigured=Boolean(process.env.GOOGLE_SHEETS_QUOTES_URL&&process.env.GOOGLE_SHEETS_SYNC_SECRET);
  return <Dashboard {...data} pokemon={pokemon} wealthHistory={wealthHistory} wealthEvents={wealthEvents} priceSyncConfigured={priceSyncConfigured} />;
}
