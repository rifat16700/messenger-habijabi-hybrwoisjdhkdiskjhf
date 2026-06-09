Project Master Plan: "BYOB Ephemeral Nexus"

Target Agent: Antigravity (AI Coding Assistant)
Language/Stack: Agnostic (Choose the best tools for the job, recommended: React/Vite + Node.js + Supabase + WebRTC).

1. Core Architecture Philosophy

This is a "Bring Your Own Backend" (BYOB) platform. The central server ONLY acts as a signaling and relay engine. It must retain ZERO user data.

Frontend (The Engine): Handles all heavy lifting, local DB (IndexedDB) storage, and WebRTC peer-to-peer logic. It must include a Service Worker for background tasks.

Signaling Server (Hugging Face - Port 7860): A Node.js/Socket.io server. Handles WebRTC offer/answer handshakes and online status (presence) via continuous ping-pong. Crucial: It must hold no database and store no files.

Offline Buffer (Supabase/Firebase): Users input their own DB config (or use a default family config). This is ONLY used to buffer text/files when the recipient is offline.

2. Features & Execution Logic

A. Authentication & User System

User Profiles: Name, Bio, Profile Pic, Cover Photo.

Media Host: Use imgbb.com API only for Profile/Cover photos. Store the returned URL in the User DB.

Auth State: Managed via the BYOB Database. Real-time presence tracked via Socket.io heartbeat.

B. Messaging & File Sharing (The Two-Way Routing)

IF Recipient is ONLINE:

Directly relay text via HF Socket.io.

For files: Establish WebRTC RTCDataChannel. Transfer directly (No size limit). Send a base64 micro-thumbnail via socket for live preview.

IF Recipient is OFFLINE:

Upload text/file to the BYOB Database/Storage.

When recipient comes online, app fetches buffered data, saves to IndexedDB (Local Storage), and IMMEDIATELY DELETES the record from the BYOB Database.

C. Push Notifications (Background Wake-up)

Subscription: When a user logs in, the Service Worker generates a Web Push Subscription object (endpoint, keys). This object is saved to their profile in the BYOB Database.

Trigger Logic: If User A sends a message/call to User B and HF server confirms B is offline:

User A's client fetches B's Push Subscription from the BYOB DB.

User A's client sends a secure trigger request to the HF Server.

HF Server uses the web-push NPM package (with VAPID keys stored in HF Environment Variables) to dispatch the notification to User B's device.

Action: User B's device wakes up, shows the notification. Tapping it opens the app, which then downloads the buffered message.

D. Audio/Video & Conference Calls (Mesh & Cascade/Tree)

1-on-1 Call: Standard WebRTC P2P connection via HF signaling.

Conference Call (>5 Users) [High Priority Logic]:

Do NOT use standard Mesh (N*(N-1) connections).

Implement Cascade/Tree Routing (Host & Sub-host).

The initiator (Root) sends streams to max 2-3 users (Sub-hosts). Those Sub-hosts relay the stream to others.

Antigravity Task: Implement "Peer Healing." If a Sub-host drops, the HF signaling server must instantly re-parent orphaned peers to another active node.

E. Story System (Ephemeral Broadcasting)

Upload: User uploads a story. Sent to BYOB Database with a 24-hour TTL (Time To Live).

Distribution: Online users receive a socket trigger, download the story to IndexedDB. Offline users download it upon their next login.

Cleanup: Downloaded stories are deleted from the DB (if user-specific) or auto-deleted by the database TTL after 24 hours.

F. Social Features

Groups and Channels (Similar to Telegram/WhatsApp).

Group messaging logic follows the same Ephemeral (Online) vs Buffered (Offline) routing, mapped to group members.

3. Admin Panel & RBAC (Role-Based Access Control)

Dashboard: Manage users, force password resets.

Dynamic Badge System:

Admin can create badges using raw SVG code (Template System).

Map abilities/permissions to badges (e.g., "Can create channels", "Can initiate conference").

Assign badges to users (e.g., Blue Tick, Moderator). User profiles will render the assigned SVG codes dynamically.

4. Antigravity Specific Instructions

Environment: Design the frontend so users are prompted to enter their DB_URL and API_KEY on first load, which saves to localStorage. Provide an option to use a "Default Network" (the master config).

Resilience: The HF server will sleep if idle. Implement a loading screen "Waking up nexus..." on the frontend if socket connection takes >2 seconds. The continuous socket ping-pong will prevent sleep during active usage.

Local First: Heavily utilize LocalForage or raw IndexedDB for message history. The app must feel fully functional even if the BYOB DB is temporarily down.

Security: Ensure WebRTC streams are utilizing standard SRTP encryption. Do not expose VAPID private keys to the client.