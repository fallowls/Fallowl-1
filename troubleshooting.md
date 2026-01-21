# Auth0 Token Troubleshooting

## Issue

When attempting to obtain an access token from the Auth0 `/oauth/token` endpoint, the request fails with an `access_denied` error, indicating an "Unauthorized" client. This issue persists even after verifying the `client_id` and `client_secret`.

## Diagnosis

The error suggests that the Auth0 application, identified by the `client_id`, is not authorized to request tokens for the specified `audience`. This is likely a configuration issue within the Auth0 dashboard.

## Recommendation

To resolve this issue, you need to ensure that the application is authorized to access the API represented by the audience. Follow these steps:

1.  **Log in to the Auth0 Dashboard.**
2.  **Navigate to your Application:** Go to **Applications > Applications** and select the application you are using.
3.  **Go to the APIs Tab:** In your application's settings, click on the **APIs** tab.
4.  **Authorize the API:** Select the API you are targeting (in this case, `api.thecloso.com`) and ensure it is authorized. If it is not, toggle the switch to authorize it.

After authorizing the API, the token request should succeed.
