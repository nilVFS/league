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

function splitPlayerTag(value = "") {
  const normalized = normalizePlayerTag(value);
  const [namePart = "", discriminator = ""] = normalized.split("#");

  return {
    normalized,
    namePart,
    discriminator,
  };
}

function getLevenshteinDistance(left = "", right = "") {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const current = previousRow[rightIndex + 1];
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        diagonal + cost
      );

      diagonal = current;
    }
  }

  return previousRow[right.length];
}

function getAllowedNameDistance(namePart = "") {
  if (namePart.length <= 4) {
    return 1;
  }

  if (namePart.length <= 10) {
    return 2;
  }

  return 3;
}

export function parseAchievementCommand(text = "") {
  const match = String(text)
    .trim()
    .match(/^!(?:выполнил|в)\s+(\S+#\d+)\s+(\d+)(?:\s+(https?:\/\/\S+))?$/iu);

  if (!match) {
    return null;
  }

  const [, playerTag, achievementCodeRaw, proofUrl = ""] = match;

  return {
    playerTag: playerTag.trim(),
    playerTagNormalized: normalizePlayerTag(playerTag),
    achievementCode: Number(achievementCodeRaw),
    proofUrl: proofUrl.trim(),
    commandText: text.trim(),
  };
}

async function resolveAllowedPlayerTag(playerTag) {
  const ladderPlayers = await listCollection(collectionNames.ladderPlayers);
  const inputTag = splitPlayerTag(playerTag);
  const exactMatch = ladderPlayers.find(
    (player) =>
      normalizePlayerTag(player.playerTag || player.tag || "") === inputTag.normalized
  );

  if (exactMatch) {
    return {
      matchType: "exact",
      playerTag: exactMatch.playerTag || exactMatch.tag || playerTag,
      playerTagNormalized: normalizePlayerTag(
        exactMatch.playerTag || exactMatch.tag || playerTag
      ),
    };
  }

  const candidates = ladderPlayers
    .map((player) => {
      const canonicalTag = player.playerTag || player.tag || "";
      const canonical = splitPlayerTag(canonicalTag);

      if (
        !canonical.discriminator ||
        canonical.discriminator !== inputTag.discriminator ||
        !canonical.namePart
      ) {
        return null;
      }

      const distance = getLevenshteinDistance(inputTag.namePart, canonical.namePart);
      const maxDistance = getAllowedNameDistance(canonical.namePart);

      if (distance > maxDistance) {
        return null;
      }

      return {
        playerTag: canonicalTag,
        playerTagNormalized: canonical.normalized,
        distance,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance);

  if (!candidates.length) {
    return null;
  }

  if (
    candidates.length > 1 &&
    candidates[0].distance === candidates[1].distance
  ) {
    return null;
  }

  return {
    matchType: "fuzzy",
    ...candidates[0],
  };
}

async function isAllowedPlayerTag(playerTagNormalized) {
  const resolvedPlayer = await resolveAllowedPlayerTag(playerTagNormalized);

  return Boolean(
    resolvedPlayer &&
      normalizePlayerTag(resolvedPlayer.playerTag || "") === resolvedPlayer.playerTagNormalized
  );
}

async function queueAchievementClaimModeration(command, meta = {}) {
  const suggestions = await listCollection(collectionNames.suggestions);
  const existingSuggestion = suggestions.find(
    (item) =>
      item.type === "ladderClaim" &&
      item.status === "pending" &&
      normalizePlayerTag(item.playerTag || "") === command.playerTagNormalized &&
      Number(item.achievementCode) === Number(command.achievementCode)
  );

  const payload = {
    type: "ladderClaim",
    title: command.playerTag,
    playerTag: command.playerTag,
    playerTagNormalized: command.playerTagNormalized,
    achievementCode: Number(command.achievementCode),
    proofUrl: command.proofUrl,
    sourceMessageId: meta.sourceMessageId || "",
    sourceMessageText: command.commandText,
    chatterLogin: meta.chatterLogin || "",
    chatterName: meta.chatterName || "",
    broadcasterUserId: meta.broadcasterUserId || "",
    broadcasterLogin: meta.broadcasterLogin || "",
    submittedAt: meta.submittedAt || new Date().toISOString(),
    consentAcceptedAt: meta.consentAcceptedAt || "",
    privacyPolicyVersion: meta.privacyPolicyVersion || "",
    description: "Игрока нет в белом списке ладдера. Нужна модерация.",
    status: "pending",
  };

  if (existingSuggestion) {
    return updateDocument(collectionNames.suggestions, existingSuggestion.id, payload);
  }

  return createDocument(collectionNames.suggestions, payload);
}

export async function saveAchievementClaim(command, meta = {}, options = {}) {
  let resolvedPlayer = {
    matchType: "exact",
    playerTag: command.playerTag,
    playerTagNormalized: command.playerTagNormalized,
  };

  if (!options.skipWhitelistCheck) {
    const allowedPlayer = await resolveAllowedPlayerTag(command.playerTag);

    if (!allowedPlayer) {
      const suggestion = await queueAchievementClaimModeration(command, meta);
      return {
        status: "pending_moderation",
        suggestion,
      };
    }

    resolvedPlayer = allowedPlayer;
  }

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

  const claimId = `${resolvedPlayer.playerTagNormalized}__${command.achievementCode}`;
  const existingClaims = await listCollection(collectionNames.achievementClaims);
  const existingClaim = existingClaims.find((item) => item.id === claimId);

  const payload = {
    id: claimId,
    playerTag: resolvedPlayer.playerTag,
    playerTagNormalized: resolvedPlayer.playerTagNormalized,
    submittedPlayerTag: command.playerTag,
    submittedPlayerTagNormalized: command.playerTagNormalized,
    playerTagMatchType: resolvedPlayer.matchType,
    achievementCode: Number(command.achievementCode),
    achievementTitle: achievement.title || "",
    achievementScore: Number(achievement.score || 0),
    achievementBonusScore: Number(achievement.bonusScore || 0),
    proofUrl: command.proofUrl,
    sourceMessageId: meta.sourceMessageId || "",
    sourceMessageText: command.commandText,
    chatterLogin: meta.chatterLogin || "",
    chatterName: meta.chatterName || "",
    broadcasterUserId: meta.broadcasterUserId || "",
    broadcasterLogin: meta.broadcasterLogin || "",
    submittedAt: meta.submittedAt || new Date().toISOString(),
    consentAcceptedAt: meta.consentAcceptedAt || "",
    privacyPolicyVersion: meta.privacyPolicyVersion || "",
    status: "accepted",
  };

  if (existingClaim) {
    const claim = await updateDocument(collectionNames.achievementClaims, claimId, payload);
    return {
      status: resolvedPlayer.matchType === "fuzzy" ? "accepted_fuzzy" : "accepted",
      claim,
    };
  }

  const claim = await createDocument(collectionNames.achievementClaims, payload);
  return {
    status: resolvedPlayer.matchType === "fuzzy" ? "accepted_fuzzy" : "accepted",
    claim,
  };
}
