import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

// Auth0 configuration
const domain = import.meta.env.VITE_AUTH0_DOMAIN || "auth.thecloso.com";
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "d3sqfAaafC9UJOYeBJGLEODLu9fr9FD0";

// Handle audience carefully. If "Service not found" error occurs, it often means
// the audience is not correctly registered in the Auth0 tenant or doesn't match.
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!domain) {
  console.error("❌ VITE_AUTH0_DOMAIN is not set. Authentication will fail.");
}

// Ensure domain has https:// prefix for Auth0Provider
const auth0Domain = domain.startsWith('http') ? domain.replace(/^https?:\/\//, '') : domain;

// Redirect URI is critical for Auth0. We must ensure it's precisely what's configured in Auth0.
const redirectUri = window.location.origin;

const onRedirectCallback = (appState: any) => {
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
};

// Check if we should omit audience to bypass "Service not found" errors during local dev
// if the user hasn't set up the API in Auth0 yet.
const authParams: any = {
  redirect_uri: window.location.origin,
  scope: "openid profile email offline_access"
};

// If audience is not configured correctly in the dashboard, it results in "Service not found" errors.
// We force exclusion of the audience if it's causing login failure.
const urlParams = new URLSearchParams(window.location.search);
const hasAudienceError = urlParams.get('error') === 'access_denied' && 
                        urlParams.get('error_description')?.includes('Service not found');

// If audience is just placeholder or known to be failing, we skip it
if (audience && audience !== "undefined" && audience !== "null" && audience !== "https://api.thecloso.com" && !hasAudienceError) {
  authParams.audience = audience;
}

createRoot(document.getElementById("root")!).render(
    <Auth0Provider
      domain={auth0Domain}
      clientId={clientId}
      authorizationParams={authParams}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
    <App />
  </Auth0Provider>
);
