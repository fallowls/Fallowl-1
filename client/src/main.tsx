import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

// Auth0 configuration
const domain = import.meta.env.VITE_AUTH0_DOMAIN || "auth.thecloso.com";
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "d3sqfAaafC9UJOYeBJGLEODLu9fr9FD0";
// The error "Service not found: https://api.thecloso.com" indicates this audience is invalid or not set up in Auth0.
// We will omit the audience if it matches the problematic one to allow basic authentication to proceed.
const rawAudience = import.meta.env.VITE_AUTH0_AUDIENCE;
const audience = (rawAudience === 'https://api.thecloso.com' || !rawAudience) ? undefined : rawAudience;

if (!domain) {
  console.error("❌ VITE_AUTH0_DOMAIN is not set. Authentication will fail.");
}

// Ensure domain has https:// prefix for Auth0Provider
const auth0Domain = domain.startsWith('http') ? domain.replace(/^https?:\/\//, '') : domain;

// Redirect URI is critical for Auth0. We must ensure it's precisely what's configured in Auth0.
const redirectUri = window.location.origin;

console.log("Auth0 Config Details:", {
  domain: auth0Domain,
  clientId,
  redirect_uri: redirectUri,
  audience: audience || 'none (problematic audience omitted)',
  window_location: window.location.href,
  origin: window.location.origin,
  public_url: import.meta.env.VITE_PUBLIC_URL || 'not set'
});

const onRedirectCallback = (appState: any) => {
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
};

createRoot(document.getElementById("root")!).render(
    <Auth0Provider
      domain={auth0Domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        ...(audience ? { audience } : {}),
        scope: "openid profile email offline_access"
      }}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
    <App />
  </Auth0Provider>
);
