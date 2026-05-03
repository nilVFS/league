import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD5Q9Z94YMK4K1OQRlQBvxZOSsaiAarOXI",
  authDomain: "league-9849c.firebaseapp.com",
  projectId: "league-9849c",
  storageBucket: "league-9849c.firebasestorage.app",
  messagingSenderId: "257528782705",
  appId: "1:257528782705:web:2e0fe43508064fe69f20d0",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export default firebaseApp;
