"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return <form action={action} className="loginForm">
    <label htmlFor="password">Mot de passe</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
    {state.error && <p className="loginError" role="alert">{state.error}</p>}
    <button className="primary loginButton" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</button>
  </form>;
}
