#!/bin/bash
curl --request POST \
  --url https://dev-6r83xajlz5akj8pu.us.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{
    "client_id":"08lNni0eg6rJjbw8rGVrX892NIwKPnt0",
    "client_secret":"mTUGP_4-eKfdQnn731d7QVYfq3W6P8yCym02yYLIyloR2ka-KyyGDiAJ-vj-kVxO",
    "audience":"api.thecloso.com",
    "grant_type":"client_credentials"
  }'
