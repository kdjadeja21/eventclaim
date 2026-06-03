import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    // Allow dev without service account — Firebase Admin can initialise with
    // just the project ID and will work for Firestore reads/writes in a real
    // project when running as an authenticated service (e.g. Cloud Run, Vercel
    // with GOOGLE_APPLICATION_CREDENTIALS).  Session-cookie verification will
    // fail until you add the service account key.
    console.warn(
      "[firebase-admin] FIREBASE_SERVICE_ACCOUNT is not set. " +
        "Session cookie verification will fail. Add your service account JSON."
    );
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
