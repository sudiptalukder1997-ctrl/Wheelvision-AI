# Auth Testing Playbook — WheelVision AI

Auth-Gated App Testing Playbook

Step 1: Create Test User & Session in MongoDB
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  tier: 'pro',
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

Step 2: Test backend API
```bash
curl -X GET "{REACT_APP_BACKEND_URL}/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

curl -X GET "{REACT_APP_BACKEND_URL}/api/sessions" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

curl -X POST "{REACT_APP_BACKEND_URL}/api/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"name": "QA Session", "batter_hand": "RH"}'
```

Step 3: Browser testing (Playwright)
```javascript
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "<host>",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
}]);
await page.goto("https://<your-app>/dashboard");
```

## Endpoints reference

- POST /api/auth/session { session_id }
- GET /api/auth/me
- POST /api/auth/logout
- GET /api/sessions
- POST /api/sessions { name, batter_hand }
- GET /api/sessions/{id}
- PATCH /api/sessions/{id} { name?, batter_hand? }
- DELETE /api/sessions/{id}
- POST /api/sessions/{id}/shots { runs, shot_type, x, y, angle }
- DELETE /api/sessions/{id}/shots/{shot_id}
- POST /api/sessions/{id}/shots/clear
- POST /api/sessions/{id}/coaching   (Pro/Academy only; needs >=3 shots)
- POST /api/payments/checkout { tier, origin_url }
- GET /api/payments/status/{session_id}
- POST /api/webhook/stripe

## Notes
- Auth uses Emergent Google OAuth + session_token cookie (httpOnly, secure, samesite=none) AND/OR Authorization: Bearer header (fallback).
- The user's `tier` field controls feature gates: `free | pro | academy`.
- Free tier limit: 10 shots/session (enforced server-side, returns 402).
