import { useMemo, useState } from "react";
import LadderModal from "../components/LadderModal";
import PageIntroCard from "../components/PageIntroCard";
import useCollectionData from "../hooks/useCollectionData";
import { collectionNames } from "../lib/content";

function LadderPage() {
  const awardsState = useCollectionData(collectionNames.awards);
  const claimsState = useCollectionData(collectionNames.achievementClaims);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const ladderRows = useMemo(() => {
    const achievementByCode = new Map(
      awardsState.items.map((award) => [Number(award.code), award])
    );
    const players = new Map();

    claimsState.items.forEach((claim) => {
      if (claim.status && claim.status !== "accepted") {
        return;
      }

      const playerTag = claim.playerTag || claim.playerTagNormalized || "unknown#0000";
      const key = claim.playerTagNormalized || playerTag.toLowerCase();
      const achievement =
        achievementByCode.get(Number(claim.achievementCode)) || null;
      const score = Number(
        claim.achievementScore ?? achievement?.score ?? 0
      );
      const title =
        claim.achievementTitle || achievement?.title || `Достижение #${claim.achievementCode}`;

      if (!players.has(key)) {
        players.set(key, {
          key,
          playerTag,
          totalScore: 0,
          achievements: [],
        });
      }

      const player = players.get(key);
      player.achievements.push({
        ...claim,
        achievementTitle: title,
        achievementScore: score,
      });
      player.totalScore += score;
    });

    return Array.from(players.values())
      .map((player) => ({
        ...player,
        achievements: [...player.achievements].sort(
          (left, right) => Number(left.achievementCode) - Number(right.achievementCode)
        ),
        achievementsCount: player.achievements.length,
      }))
      .sort((left, right) => {
        if (left.totalScore !== right.totalScore) {
          return right.totalScore - left.totalScore;
        }

        if (left.achievementsCount !== right.achievementsCount) {
          return right.achievementsCount - left.achievementsCount;
        }

        return left.playerTag.localeCompare(right.playerTag, "ru");
      });
  }, [awardsState.items, claimsState.items]);

  const loading = awardsState.loading || claimsState.loading;
  const error = awardsState.error || claimsState.error;

  return (
    <main className="inner-page">
      <PageIntroCard
        description="Лидерборд собирается из подтверждённых выполнений достижений. Нажми на строку игрока, чтобы увидеть полный список и ссылки на подтверждение."
        eyebrow="Ладдер"
        title="Таблица лидеров"
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
                  {ladderRows.map((player, index) => (
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
              `!выполнил`, здесь появятся игроки.
            </div>
          )
        ) : null}
      </PageIntroCard>

      <LadderModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </main>
  );
}

export default LadderPage;
