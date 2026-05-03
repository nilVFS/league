import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "./firebase";

export const collectionNames = {
  clips: "clips",
  participants: "participants",
  awards: "awards",
  suggestions: "suggestions",
};

export function subscribeToCollection(name, onData, onError) {
  const collectionQuery = query(
    collection(db, name),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    collectionQuery,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      onData(items);
    },
    onError
  );
}

export async function createDocument(name, payload) {
  return addDoc(collection(db, name), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export async function updateDocument(name, id, payload) {
  return updateDoc(doc(db, name, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDocument(name, id) {
  return deleteDoc(doc(db, name, id));
}

export async function isCollectionEmpty(name) {
  const snapshot = await getDocs(query(collection(db, name), limit(1)));
  return snapshot.empty;
}

export async function seedCollection(name, items) {
  const batch = writeBatch(db);

  items.forEach((item) => {
    const refDoc = doc(collection(db, name));
    batch.set(refDoc, {
      ...item,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function uploadFile(path, file) {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}
