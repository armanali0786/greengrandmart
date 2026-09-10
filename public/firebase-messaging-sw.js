// Required by Firebase Cloud Messaging for background/closed-tab web push
// (docs/Product_Spec_Requirements.md §10.2) — must live at this exact path
// and be registered with this exact scope for the browser to treat it as
// the messaging service worker.
//
// Config arrives as query params on the registration URL (see
// lib/firebase-client.ts's requestPushToken()) rather than being hardcoded
// here, since this static file can't read NEXT_PUBLIC_* env vars and would
// otherwise be tied to one specific Firebase project/environment.
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

firebase.messaging();
