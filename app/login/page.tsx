import { redirect } from "next/navigation";
import { getCurrentUser } from "../../src/server/auth.js";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <main className="loginPage"><section className="loginPanel">
    <div className="brand loginBrand"><span className="brandMark">W</span><span>My Wallet Finance</span></div>
    <p className="eyebrow">Espace privé</p><h1>Bienvenue.</h1>
    <p className="loginIntro">Bonjour Cyril. Saisissez votre mot de passe pour continuer.</p>
    <LoginForm />
  </section></main>;
}
