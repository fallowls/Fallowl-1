import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

// Automatically use current domain - this ensures Auth0 redirect works
// correctly even when Replit changes the domain
// You can manually override by setting VITE_AUTH0_REDIRECT_URI
const redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin;

if (redirectUri.includes("127.0.0.1") || redirectUri.includes("localhost")) {
  console.warn("⚠️ Localhost redirect detected in main.tsx, but app is on Replit domain.");
}

// Don't use Management API audience for user authentication
// If you have a custom API, set VITE_AUTH0_AUDIENCE in your environment
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

console.log("Auth0 Config:", {
  domain,
  clientId: clientId.substring(0, 8) + "...",
  redirect_uri: redirectUri,
  audience: audience || 'none (basic auth)'
});

const onRedirectCallback = (appState: any) => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  
  if (error) {
    console.error('Auth0 Error:', error, errorDescription);
    // Store error in sessionStorage so App can display it
    sessionStorage.setItem('auth0_error', JSON.stringify({ error, errorDescription }));
  }
  
  // Navigate to the target URL or home
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
};

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain={domain}
    clientId={clientId}
    authorizationParams={{
      redirect_uri: redirectUri,
      ...(audience ? { audience } : {}),
      scope: "openid profile email"
    }}
    onRedirectCallback={onRedirectCallback}
  >
    <App />
  </Auth0Provider>
);
