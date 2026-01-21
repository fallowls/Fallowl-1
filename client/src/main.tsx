import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

// Auth0 configuration
const domain = import.meta.env.VITE_AUTH0_DOMAIN || "auth.thecloso.com";
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "d3sqfAaafC9UJOYeBJGLEODLu9fr9FD0";
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!domain) {
  console.error("❌ VITE_AUTH0_DOMAIN is not set. Authentication will fail.");
}

// Ensure domain has https:// prefix for Auth0Provider
const auth0Domain = domain.startsWith('http') ? domain.replace(/^https?:\/\//, '') : domain;

const onRedirectCallback = (appState: any) => {
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || window.location.pathname
  );
};

// Simplified Auth0 params - conditionally include audience if it's set and valid
const authParams: any = {
  redirect_uri: window.location.origin,
  scope: "openid profile email offline_access"
};

if (audience && audience !== "undefined" && audience !== "null") {
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
