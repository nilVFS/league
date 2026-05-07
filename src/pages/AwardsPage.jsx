import { useMemo, useState } from "react";
import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";

function AwardsPage() {
  const {
    items: awards,
    loading,
    error,
  } = useCollectionData(collectionNames.awards);
  const [search, setSearch] = useState("");

  const sortedAwards = useMemo(
    () => [...awards].sort((left, right) => Number(left.code || 0) - Number(right.code || 0)),
    [awards]
  );

  const filteredAwards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return sortedAwards;
    }

    return sortedAwards.filter((award) =>
      [award.title, award.code]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query))
    );
  }, [search, sortedAwards]);

  return (
    <main className="inner-page">
      <PageIntroCard title="Цели и баллы">
        <div className="awards-toolbar">
          <label className="awards-search" htmlFor="awards-search">
            <span className="awards-search__label">Поиск</span>
            <input
              id="awards-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Номер, цель или примечание"
              type="search"
              value={search}
            />
          </label>
        </div>
        {loading ? <div className="state-box">Загружаем награды...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          awards.length ? (
            <div className="tasks-table tasks-table--awards">
              <table>
                <colgroup>
                  <col className="tasks-table__col tasks-table__col--number" />
                  <col className="tasks-table__col tasks-table__col--title" />
                  <col className="tasks-table__col tasks-table__col--score" />
                  <col className="tasks-table__col tasks-table__col--score" />
                </colgroup>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Цель</th>
                    <th>Баллы</th>
                    <th>Бонус первому</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAwards.map((item) => (
                    <tr key={item.id}>
                      <td data-label="№">{item.code ?? "—"}</td>
                      <td data-label="Цель">{item.title}</td>
                      <td className="tasks-table__score" data-label="Баллы">
                        {item.score}
                      </td>
                      <td className="tasks-table__score" data-label="Бонус первому">
                        {Number(item.bonusScore || 0) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state-box">Пока нет наград. Добавь их через `/admin`.</div>
          )
        ) : null}

        {!loading && !error && awards.length && !filteredAwards.length ? (
          <div className="state-box">По этому запросу ничего не нашлось.</div>
        ) : null}
      </PageIntroCard>
    </main>
  );
}

export default AwardsPage;
