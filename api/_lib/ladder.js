import {
  collectionNames,
  createDocument,
  listCollection,
  updateDocument,
} from "./content-store.js";

export function normalizePlayerTag(value = "") {
  return String(value)
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function parseAchievementCommand(text = "") {
  const match = String(text)
    .trim()
    .match(/^!выполнил\s+(\S+#\d+)\s+(\d+)\s+(https?:\/\/\S+)$/iu);

  if (!match) {
    return null;
  }

  const [, playerTag, achievementCodeRaw, proofUrl] = match;

  return {
    playerTag: playerTag.trim(),
    playerTagNormalized: normalizePlayerTag(playerTag),
    achievementCode: Number(achievementCodeRaw),
    proofUrl: proofUrl.trim(),
    commandText: text.trim(),
  };
}

export async function saveAchievementClaim(command, meta = {}) {
  const achievements = await listCollection(collectionNames.awards);
  const achievement = achievements.find(
    (item) => Number(item.code) === Number(command.achievementCode)
  );

  if (!achievement) {
    const error = new Error(
      `Достижение с номером ${command.achievementCode} не найдено.`
    );
    error.statusCode = 422;
    throw error;
  }

  const claimId = `${command.playerTagNormalized}__${command.achievementCode}`;
  const existingClaims = await listCollection(collectionNames.achievementClaims);
  const existingClaim = existingClaims.find((item) => item.id === claimId);

  const payload = {
    id: claimId,
    playerTag: command.playerTag,
    playerTagNormalized: command.playerTagNormalized,
    achievementCode: Number(command.achievementCode),
    achievementTitle: achievement.title || "",
    achievementScore: Number(achievement.score || 0),
    achievementBonusScore: Number(achievement.bonusScore || 0),
    proofUrl: command.proofUrl,
    sourceMessageId: meta.sourceMessageId || "",
    sourceMessageText: command.commandText,
    chatterLogin: meta.chatterLogin || "",
    chatterName: meta.chatterName || "",
    broadcasterLogin: meta.broadcasterLogin || "",
    submittedAt: meta.submittedAt || new Date().toISOString(),
    status: "accepted",
  };

  if (existingClaim) {
    return updateDocument(collectionNames.achievementClaims, claimId, payload);
  }

  return createDocument(collectionNames.achievementClaims, payload);
}
