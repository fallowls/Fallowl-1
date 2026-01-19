import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

// Auth0 configuration
const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "d3sqfAaafC9UJOYeBJGLEODLu9fr9FD0";
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!domain) {
  console.error("❌ VITE_AUTH0_DOMAIN is not set. Authentication will fail.");
}

// Ensure the redirect URI matches the actual URL the user is accessing
const redirectUri = window.location.origin;

console.log("Auth0 Config Details:", {
  domain,
  clientId,
  redirect_uri: redirectUri,
  audience: audience || 'none',
  window_location: window.location.href,
  origin: window.location.origin
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
      domain={domain!}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(audience ? { audience } : {}),
        scope: "openid profile email"
      }}
      onRedirectCallback={onRedirectCallback}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
    <App />
  </Auth0Provider>
);
