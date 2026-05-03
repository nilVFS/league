import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";

function AwardsPage() {
  const {
    items: awards,
    loading,
    error,
  } = useCollectionData(collectionNames.awards);

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
            <div className="tasks-table">
              <table>
                <thead>
                  <tr>
                    <th>Награда</th>
                    <th>Баллы</th>
                  </tr>
                </thead>
                <tbody>
                  {awards.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td className="tasks-table__score">{item.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
