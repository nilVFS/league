import {
  collectionNames,
  createDocument,
  listCollection,
  updateDocument,
} from "../api/_lib/content-store.js";

async function upsertById(collectionName, id, payload) {
  const items = await listCollection(collectionName);
  const existing = items.find(
    (item) => String(item.id || "") === String(id)
  );

  if (existing) {
    return updateDocument(collectionName, id, payload);
  }

  return createDocument(collectionName, {
    id,
    ...payload,
  });
}

async function main() {
  const awards = [
    {
      id: "award_101",
      code: 101,
      title: "Победить босса без смертей",
      score: 10,
      bonusScore: 5,
    },
    {
      id: "award_102",
      code: 102,
      title: "Закрыть карту на скорость",
      score: 7,
      bonusScore: 3,
    },
  ];

  const ladderPlayers = [
    {
      id: "player_nilv_1234",
      playerTag: "nilv#1234",
      tag: "nilv#1234",
    },
    {
      id: "player_mind_5678",
      playerTag: "MindOv3rMeta#5678",
      tag: "MindOv3rMeta#5678",
    },
  ];

  const claims = [
    {
      id: "nilv#1234__101",
      playerTag: "nilv#1234",
      playerTagNormalized: "nilv#1234",
      submittedPlayerTag: "nilv#1234",
      submittedPlayerTagNormalized: "nilv#1234",
      playerTagMatchType: "exact",
      achievementCode: 101,
      achievementTitle: "Победить босса без смертей",
      achievementScore: 10,
      achievementBonusScore: 5,
      proofUrl: "https://clips.twitch.tv/",
      sourceMessageText: "!в nilv#1234 101",
      chatterLogin: "demo_user",
      chatterName: "Demo User",
      broadcasterLogin: "nilv_",
      submittedAt: "2026-05-07T15:00:00.000Z",
      status: "accepted",
    },
    {
      id: "mindov3rmeta#5678__102",
      playerTag: "MindOv3rMeta#5678",
      playerTagNormalized: "mindov3rmeta#5678",
      submittedPlayerTag: "MindOv3rMeta#5678",
      submittedPlayerTagNormalized: "mindov3rmeta#5678",
      playerTagMatchType: "exact",
      achievementCode: 102,
      achievementTitle: "Закрыть карту на скорость",
      achievementScore: 7,
      achievementBonusScore: 3,
      proofUrl: "https://clips.twitch.tv/",
      sourceMessageText: "!в MindOv3rMeta#5678 102",
      chatterLogin: "demo_user",
      chatterName: "Demo User",
      broadcasterLogin: "mindov3rmeta",
      submittedAt: "2026-05-07T16:00:00.000Z",
      status: "accepted",
    },
    {
      id: "nilv#1234__102",
      playerTag: "nilv#1234",
      playerTagNormalized: "nilv#1234",
      submittedPlayerTag: "nilv#1234",
      submittedPlayerTagNormalized: "nilv#1234",
      playerTagMatchType: "exact",
      achievementCode: 102,
      achievementTitle: "Закрыть карту на скорость",
      achievementScore: 7,
      achievementBonusScore: 3,
      proofUrl: "https://clips.twitch.tv/",
      sourceMessageText: "!в nilv#1234 102",
      chatterLogin: "demo_user",
      chatterName: "Demo User",
      broadcasterLogin: "nilv_",
      submittedAt: "2026-05-07T17:00:00.000Z",
      status: "accepted",
    },
  ];

  for (const award of awards) {
    await upsertById(collectionNames.awards, award.id, award);
  }

  for (const player of ladderPlayers) {
    await upsertById(collectionNames.ladderPlayers, player.id, player);
  }

  for (const claim of claims) {
    await upsertById(collectionNames.achievementClaims, claim.id, claim);
  }

  console.log(
    `Seeded demo ladder data: ${awards.length} awards, ${ladderPlayers.length} players, ${claims.length} claims.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
