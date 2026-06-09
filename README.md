---
title: Hybrid Engine Signaling Server
emoji: 🚀
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
---

# 🚀 The Hybrid Engine — সেটআপ গাইড

## প্রজেক্ট স্ট্রাকচার
```
messenger/
├── server/          ← Hugging Face Space (Node.js)
├── app/             ← React Native + Expo App
└── *.md             ← Plan files
```

---

## ধাপ ১ — Supabase SQL রান করো

1. [Supabase Dashboard](https://app.supabase.com) → তোমার project খোলো
2. বাম মেনু → **SQL Editor** → **New query**
3. `server/supabase_schema.sql` ফাইলের পুরো content copy করে paste করো
4. **Run** বাটন চাপো

---

## ধাপ ২ — Supabase Anon Key দাও

1. Supabase Dashboard → **Settings** → **API**
2. **Project API keys** section-এ `anon` `public` key টা copy করো
   *(service_role key নয়!)*
3. `app/src/config.js` ফাইলে `SUPABASE_ANON_KEY` এ paste করো

---

## ধাপ ৩ — Firebase Setup (Push Notifications)

1. [Firebase Console](https://console.firebase.google.com) → নতুন project তৈরি করো
2. **Project Settings** → **Service Accounts** → **Generate new private key**
3. JSON ফাইল download হবে
4. সেই JSON ফাইলের content `server/firebase_config.js` তে `FIREBASE_CONFIG` object-এ paste করো

> ⚠️ Firebase ছাড়াও সব কিছু কাজ করবে, শুধু Push Notification কাজ করবে না।

---

## ধাপ ৪ — Server (Hugging Face) Deploy

1. [Hugging Face](https://huggingface.co) → New Space → **Node.js** template
2. `server/` ফোল্ডারের সব ফাইল upload করো
3. Space URL পাবে (যেমন: `https://YOUR-USERNAME-hybrid-engine.hf.space`)
4. সেই URL `app/src/config.js` তে `SIGNALING_SERVER_URL` এ দাও

---

## ধাপ ৫ — App Run করো

```bash
cd app
npm install    # dependencies install
npx expo start # development server
```

- Android এ test করতে: Expo Go app install করো → QR scan করো
- APK বানাতে: `npx eas build -p android`

---

## 🔑 Firebase Config Format

`server/firebase_config.js` ফাইলে এভাবে ভরবে:

```js
module.exports = {
  FIREBASE_CONFIG: {
    "type": "service_account",
    "project_id": "তোমার-project-id",
    "private_key_id": "xxxx",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-xxxx@project.iam.gserviceaccount.com",
    // ... বাকি fields
  }
};
```

---

## ✅ Credentials Checklist

| Item | Status | Location |
|---|---|---|
| Supabase URL | ✅ Done | `config.js` এ আছে |
| Supabase Anon Key | ⏳ তোমার কাজ | `app/src/config.js` |
| Firebase Config | ⏳ তোমার কাজ | `server/firebase_config.js` |
| ImgBB API Key | ✅ Done | `config.js` এ আছে |
| HF Server URL | ⏳ Deploy পরে | `app/src/config.js` |

---

## 🎯 Features

- 🔒 **P2P Chat** — WebRTC Data Channel (সরাসরি ডিভাইস থেকে ডিভাইস)
- 📁 **Unlimited File Transfer** — কোনো সাইজ লিমিট নেই
- 🌙 **Ultra-Private Ephemeral** — Server restart হলে buffer মুছে যায়, Resend option আসে
- 📞 **Voice & Video Call** — 1-on-1 এবং Group (Tree routing)
- 🔔 **Push Notifications** — App বন্ধ থাকলেও কল/message আসে
- 🏆 **Badge System** — SVG badges with custom permissions
- 🛡️ **Admin Panel** — User management, ban, role change
- 🌓 **Light & Dark Mode** — দুটোই আছে!
- 💰 **Zero Cost** — সার্ভার স্টোরেজ কস্ট ০ টাকা!
