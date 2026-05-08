import { useCallback, useEffect, useState } from "react";
import { fetchCollection, subscribeToCollection } from "../lib/content";

function useCollectionData(collectionName, options = {}) {
  const { enabled = true, pollIntervalMs } = options;
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
    if (!enabled) {
      setLoading(false);
      return () => {};
    }

    setLoading(true);

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
      },
      { enabled, pollIntervalMs }
    );

    return () => unsubscribe();
  }, [collectionName, enabled, pollIntervalMs]);

  return { items, loading, error, refresh };
}

export default useCollectionData;
