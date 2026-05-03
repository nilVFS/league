import { useEffect, useState } from "react";
import { subscribeToCollection } from "../lib/content";

function useCollectionData(collectionName) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToCollection(
      collectionName,
      (data) => {
        setItems(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Не удалось загрузить данные");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName]);

  return { items, loading, error };
}

export default useCollectionData;
