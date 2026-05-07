export function buildLadderRows(awards = [], claims = []) {
  const achievementByCode = new Map(
    awards.map((award) => [Number(award.code), award])
  );
  const acceptedClaims = claims.filter(
    (claim) => !claim.status || claim.status === "accepted"
  );
  const firstClaimByCode = new Map();

  acceptedClaims.forEach((claim) => {
    const code = Number(claim.achievementCode);
    const currentFirst = firstClaimByCode.get(code);
    const currentTime =
      Date.parse(claim.submittedAt || claim.createdAt || claim.updatedAt || "") || 0;
    const firstTime = currentFirst
      ? Date.parse(
          currentFirst.submittedAt ||
            currentFirst.createdAt ||
            currentFirst.updatedAt ||
            ""
        ) || 0
      : Number.POSITIVE_INFINITY;

    if (!currentFirst || currentTime < firstTime) {
      firstClaimByCode.set(code, claim);
    }
  });

  const players = new Map();

  acceptedClaims.forEach((claim) => {
    const playerTag = claim.playerTag || claim.playerTagNormalized || "unknown#0000";
    const key = claim.playerTagNormalized || playerTag.toLowerCase();
    const achievement = achievementByCode.get(Number(claim.achievementCode)) || null;
    const baseScore = Number(claim.achievementScore ?? achievement?.score ?? 0);
    const bonusScore = Number(
      claim.achievementBonusScore ?? achievement?.bonusScore ?? 0
    );
    const isFirstCompletion =
      firstClaimByCode.get(Number(claim.achievementCode))?.id === claim.id;
    const totalClaimScore = baseScore + (isFirstCompletion ? bonusScore : 0);
    const title =
      claim.achievementTitle ||
      achievement?.title ||
      `Достижение #${claim.achievementCode}`;
    const broadcasterLabel = claim.broadcasterLogin
      ? `twitch.tv/${claim.broadcasterLogin}`
      : "";

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
      achievementScore: baseScore,
      achievementBonusScore: bonusScore,
      isFirstCompletion,
      totalClaimScore,
      broadcasterLabel,
    });
    player.totalScore += totalClaimScore;
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
}
