import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

// Use current origin but log it for debugging
const redirectUri = window.location.origin;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

console.log("Auth0 Config Details:", {
  domain,
  clientId,
  redirect_uri: redirectUri,
  audience: audience || 'none',
  window_location: window.location.href,
  origin: window.location.origin
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
      redirect_uri: window.location.origin,
      ...(audience ? { audience } : {}),
      scope: "openid profile email"
    }}
    onRedirectCallback={onRedirectCallback}
  >
    <App />
  </Auth0Provider>
);
