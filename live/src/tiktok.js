import { teamCommand } from "./warfare.js";
import { safeAvatar } from "./hud-data.js";
import { normalizeGiftName } from "./gifts.js";
// TikTok-Live-Connector 2.5 native events use nested user/giftDetails/common.
export class TikTokIngest {
  constructor(battle, { source = "live" } = {}) {
    this.source = source;
    this.battle = battle;
    this.seen = new Set();
    this.streakRounds = new Map();
  }
  observeGift(raw, evidence = "connector-gift-event", notify = true) {
    const giftId = String(raw.giftId ?? raw.id ?? ""),
      giftName = String(raw.giftName ?? raw.name ?? "")
        .trim()
        .slice(0, 80);
    if (!giftId && !giftName) return;
    const coins = Number(raw.coins ?? raw.diamond_count ?? raw.diamondCount),
      key = giftId || giftName;
    const entry = {
      giftId,
      giftName,
      coins: Number.isFinite(coins) && coins > 0 ? coins : null,
      icon: safeAvatar(
        raw.giftIcon ||
          raw.icon ||
          raw.image?.url_list?.[0] ||
          raw.image?.urlList?.[0] ||
          this.battle.giftCatalog?.get(key)?.icon ||
          "",
      ),
      source: this.source,
      evidence:
        evidence === "persisted-live-metadata" ? raw.evidence : evidence,
      observedAt:
        evidence === "persisted-live-metadata" ? raw.observedAt : Date.now(),
    };
    if (
      this.source === "live" ||
      this.battle.giftCatalog?.get(key)?.source !== "live"
    )
      this.battle.giftCatalog?.set(key, entry);
    if (this.source === "live" && /^[1-9]\d{0,23}$/.test(giftId) && giftName) {
      const lion = this.battle.giftMappings.find((r) => r.key === "lion-frost");
      if (
        lion &&
        !lion.giftId &&
        ["lion", "sutu"].includes(normalizeGiftName(giftName))
      )
        Object.assign(lion, {
          giftId,
          giftName,
          type: "frostDragon",
          count: 1,
          enabled: true,
        });
      for (const row of this.battle.giftMappings)
        if (
          row.pendingVerification &&
          row.giftId === giftId &&
          ["frostDragon", "fireDragon"].includes(row.type)
        ) {
          Object.assign(row, {
            giftName,
            count: 1,
            enabled: true,
            pendingVerification: false,
          });
          delete row.minCoins;
          for (const other of this.battle.giftMappings)
            if (other !== row && other.giftId === giftId) {
              other.enabled = false;
              other.pendingVerification = false;
            }
        }
      if (lion?.giftId === giftId && lion.enabled) delete lion.minCoins;
    }
    // Keep explicitly configured monster IDs while bounding the display catalog.
    const protectedIds = new Set(
      this.battle.giftMappings
        .filter((r) => r.type === "frostDragon" || r.type === "fireDragon")
        .map((r) => r.giftId),
    );
    if (this.battle.giftCatalog?.size > 200)
      for (const k of this.battle.giftCatalog.keys())
        if (!protectedIds.has(k)) {
          this.battle.giftCatalog.delete(k);
          break;
        }
    if (notify && this.source === "live") this.battle.onGiftMetadata?.(entry);
  }
  catalog(items, evidence = "connector-room-gift-list") {
    if (this.source !== "live" || !Array.isArray(items)) return;
    for (const item of items.slice(0, 5000))
      this.observeGift(item, evidence, false);
    this.battle.onGiftMetadata?.();
  }
  normalize(data) {
    const raw = data?.user;
    const id = raw?.userId || raw?.id;
    const user =
      raw && id && String(id) !== "0"
        ? {
            ...raw,
            userId: String(id),
            nickname:
              raw.nickname ||
              raw.uniqueId ||
              raw.displayId ||
              this.battle.profiles.get(String(id))?.name ||
              String(id),
          }
        : undefined;
    const gift = data?.gift;
    return {
      ...data,
      user,
      giftDetails:
        data?.giftDetails ||
        (gift
          ? {
              ...gift,
              giftName: gift.name,
              giftType: gift.type,
              giftImage: gift.image,
            }
          : undefined),
    };
  }
  profile(data) {
    const user = data?.user;
    if (user?.userId)
      this.battle.profile?.(
        user.userId,
        user.nickname || user.uniqueId,
        user.avatarThumb?.urlList?.[0] ||
          user.avatarMedium?.urlList?.[0] ||
          user.profilePictureUrl ||
          data.profilePictureUrl,
        this.source,
      );
  }
  chat(data) {
    data = this.normalize(data);
    this.profile(data);
    const id = data.user?.userId,
      team = teamCommand(data.comment);
    if (id && team !== null) {
      const key = String(data.common?.msgId || data.msgId || "");
      if (key && key !== "0") {
        const receipt = "chat:" + key;
        if (this.seen.has(receipt) || !this.battle.acceptReceipt(receipt))
          return { duplicate: true };
        this.seen.add(receipt);
        if (this.seen.size > 5000)
          this.seen.delete(this.seen.values().next().value);
      }
      return this.battle.choose(id, team, data.user.nickname, this.source);
    }
    return { ignored: true };
  }
  like(data) {
    data = this.normalize(data);
    this.profile(data);
    const id = data.user?.userId,
      count = Number(data.count ?? data.likeCount),
      key = String(data.common?.msgId || data.msgId || "");
    const total = data.total ?? data.totalLikeCount;
    if (total !== undefined)
      this.battle.likeDiagnostics.roomTotal = String(total);
    if (!id || !Number.isInteger(count) || count < 1 || !key || key === "0") {
      this.battle.likeDiagnostics.rejected++;
      if (!id) this.battle.likeDiagnostics.unattributed++;
      return {
        ignored: true,
        reason:
          "Need per-viewer packet delta and stable event ID; room totals are informational only",
      };
    }
    const k = "like-" + key;
    if (this.seen.has(k) || !this.battle.acceptReceipt(k))
      return { duplicate: true };
    this.seen.add(k);
    if (this.seen.size > 5000)
      this.seen.delete(this.seen.values().next().value);
    return this.battle.likes({
      id,
      name: data.user.nickname,
      count,
      origin: this.source === "demo" ? "demoLikes" : "likes",
    });
  }
  gift(data) {
    data = this.normalize(data);
    this.profile(data);
    const user = data?.user,
      id = user?.userId,
      details = data?.giftDetails;
    if (!id || !details) return { error: "Missing gift/user metadata" };
    const rawId = String(data.giftId || details.id || "");
    const giftId = rawId === "0" ? "" : rawId,
      giftName = String(
        details.giftName || data.giftName || details.name || "",
      );
    const coins = Number(details.diamondCount);
    this.observeGift(
      {
        giftId,
        giftName,
        coins,
        giftIcon:
          details.giftImage?.urlList?.[0] ||
          details.image?.urlList?.[0] ||
          data.extendedGiftInfo?.image?.url_list?.[0],
      },
      "connector-gift-event",
    );
    const groupValue = String(data.groupId || data.streakId || "");
    const group =
      Number(details.giftType) === 1 && groupValue !== "0" ? groupValue : "";
    const message = data.common?.msgId || data.msgId;
    const createTime = Number(data.common?.createTime || 0);
    const identity = group
      ? `group:${id}:${giftId}:${group}`
      : message
        ? String(message)
        : "";
    if (!identity) return { error: "Gift without stable event ID rejected" };
    const streakKey = group ? identity : `${id}:${giftId}`;
    if (
      Number(details.giftType) === 1 &&
      !(data.repeatEnd === true || Number(data.repeatEnd) === 1)
    ) {
      if (!this.streakRounds.has(streakKey))
        this.streakRounds.set(streakKey, this.battle.roundId);
      if (this.streakRounds.size > 1000)
        this.streakRounds.delete(this.streakRounds.keys().next().value);
      return { pending: true };
    }
    const continuedStreak = this.streakRounds.has(streakKey);
    const roundId = this.streakRounds.get(streakKey);
    this.streakRounds.delete(streakKey);
    if (
      this.seen.has(identity) ||
      !this.battle.acceptReceipt("gift:" + identity)
    )
      return { duplicate: true };
    if (group && message && !this.battle.acceptReceipt("gift:" + message))
      return { duplicate: true };
    this.seen.add(identity);
    if (this.seen.size > 5000)
      this.seen.delete(this.seen.values().next().value);
    return this.battle.gift({
      id,
      origin: this.source === "demo" ? "demoGift" : "gift",
      name: user.nickname || user.uniqueId || "Viewer",
      coins,
      count:
        Number(details.giftType) !== 1 && !Number(data.repeatCount)
          ? 1
          : (data.repeatCount ?? 1),
      giftId,
      giftName,
      avatar:
        user.avatarThumb?.urlList?.[0] ||
        user.avatarMedium?.urlList?.[0] ||
        user.profilePictureUrl ||
        data.profilePictureUrl ||
        "",
      giftIcon: this.battle.giftCatalog?.get(giftId || giftName)?.icon || "",
      roundId: continuedStreak ? undefined : roundId,
      continuedStreak,
      eventAt: createTime
        ? createTime < 1e12
          ? createTime * 1000
          : createTime
        : undefined,
    });
  }
}
