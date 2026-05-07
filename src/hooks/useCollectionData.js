import { useCallback, useEffect, useState } from "react";
import { fetchCollection, subscribeToCollection } from "../lib/content";

function useCollectionData(collectionName) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCollection(collectionName);
      setItems(data);
      setError("");
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message || "Не удалось загрузить данные");
      setLoading(false);
      throw err;
    }
  }, [collectionName]);

  useEffect(() => {
    const unsubscribe = subscribeToCollection(
      collectionName,
      (data) => {
        setItems(data);
        setError("");
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Не удалось загрузить данные");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName]);

  return { items, loading, error, refresh };
}

export default useCollectionData;
