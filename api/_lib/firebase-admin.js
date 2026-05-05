import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function normalizePrivateKey(value = "") {
  return value.replace(/\\n/g, "\n");
}

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    return {
      ...parsed,
      private_key: normalizePrivateKey(parsed.private_key || ""),
    };
  }

  if (
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    };
  }

  throw new Error("Firebase Admin credentials are not configured.");
}

function getAdminApp() {
  if (getApps().length) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert(getServiceAccount()),
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export { FieldValue };
