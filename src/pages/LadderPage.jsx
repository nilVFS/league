import { useMemo, useState } from "react";
import LadderModal from "../components/LadderModal";
import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";
import { buildLadderRows } from "../../shared/ladder";

function LadderPage() {
  const awardsState = useCollectionData(collectionNames.awards);
  const claimsState = useCollectionData(collectionNames.achievementClaims);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [search, setSearch] = useState("");

  const ladderRows = useMemo(() => {
    return buildLadderRows(awardsState.items, claimsState.items);
  }, [awardsState.items, claimsState.items]);

  const loading = awardsState.loading || claimsState.loading;
  const error = awardsState.error || claimsState.error;
  const filteredLadderRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return ladderRows;
    }

    return ladderRows.filter((player) =>
      String(player.playerTag || "").toLowerCase().includes(query)
    );
  }, [ladderRows, search]);

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Лидерборд собирается из подтверждённых выполнений достижений. Нажми на строку игрока, чтобы увидеть полный список и ссылки на подтверждение."
        eyebrow="Ладдер"
        title="Таблица лидеров"
        titleAction={
          <label className="page-search page-search--inline" htmlFor="ladder-search">
            <span className="sr-only">Поиск по игрокам</span>
            <span aria-hidden="true" className="page-search__icon">
              ⌕
            </span>
            <input
              id="ladder-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по игрокам"
              type="search"
              value={search}
            />
          </label>
        }
      >
        {loading ? <div className="state-box">Загружаем ладдер...</div> : null}
        {error ? <div className="state-box state-box--error">{error}</div> : null}

        {!loading && !error ? (
          ladderRows.length ? (
            <div className="ladder-table">
              <table>
                <thead>
                  <tr>
                    <th>Игрок</th>
                    <th>Выполнено</th>
                    <th>Баллы</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLadderRows.map((player, index) => (
                    <tr
                      className="ladder-table__row"
                      key={player.key}
                      onClick={() => setSelectedPlayer(player)}
                    >
                      <td data-label="Игрок">
                        <div className="ladder-table__player">
                          <span className="ladder-table__rank">{index + 1}</span>
                          <span>{player.playerTag}</span>
                        </div>
                      </td>
                      <td data-label="Выполнено">{player.achievementsCount}</td>
                      <td className="ladder-table__score" data-label="Баллы">
                        {player.totalScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state-box">
              Пока нет выполненных достижений. Как только в чат начнут прилетать команды
              `!выполнил` или `!в`, здесь появятся игроки.
            </div>
          )
        ) : null}

        {!loading && !error && ladderRows.length && !filteredLadderRows.length ? (
          <div className="state-box">По этому запросу игроки не нашлись.</div>
        ) : null}
      </PageIntroCard>

      <LadderModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </main>
  );
}

export default LadderPage;
