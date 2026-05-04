import { useMemo } from "react";
import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";

function AwardsPage() {
  const {
    items: awards,
    loading,
    error,
  } = useCollectionData(collectionNames.awards);
  const groupedAwards = useMemo(() => {
    const groups = new Map();

    awards.forEach((award) => {
      const category = (award.category || "Общие").trim() || "Общие";
      if (!groups.has(category)) {
        groups.set(category, []);
      }

      groups.get(category).push(award);
    });

    return Array.from(groups.entries());
  }, [awards]);

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Список наград и баллов, как мне не будет лень, тогда и добавлю."
        eyebrow="Награды"
        title="Список наград и баллов"
      >
        {loading ? <div className="state-box">Загружаем награды...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          awards.length ? (
            <div className="awards-groups">
              {groupedAwards.map(([category, items]) => (
                <section className="awards-group" key={category}>
                  <h2 className="awards-group__title">{category}</h2>
                  <div className="tasks-table tasks-table--awards">
                    <table>
                      <colgroup>
                        <col className="tasks-table__col tasks-table__col--title" />
                        <col className="tasks-table__col tasks-table__col--score" />
                        <col className="tasks-table__col tasks-table__col--description" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Награда</th>
                          <th>Баллы</th>
                          <th>Бонус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td data-label="Награда">{item.title}</td>
                            <td className="tasks-table__score" data-label="Баллы">
                              {item.score}
                            </td>
                            <td data-label="Бонус">{item.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="state-box">Пока нет наград. Добавь их через `/admin`.</div>
          )
        ) : null}
      </PageIntroCard>
    </main>
  );
}

export default AwardsPage;
