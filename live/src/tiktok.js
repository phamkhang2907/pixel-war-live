// TikTok-Live-Connector 2.5 native events use nested user/giftDetails/common.
export class TikTokIngest {
  constructor(battle, { source = "live" } = {}) {
    this.source = source;
    this.battle = battle;
    this.seen = new Set();
    this.streakRounds = new Map();
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
      );
  }
  chat(data) {
    this.profile(data);
    const id = data.user?.userId;
    const comment = String(data.comment || "").trim();
    if (id && (comment === "1" || comment === "2"))
      this.battle.choose(
        id,
        Number(comment) - 1,
        data.user.nickname || data.user.uniqueId || String(id),
      );
  }
  like(data) {
    this.profile(data);
    const id = data?.user?.userId,
      count = Number(data?.likeCount),
      key = data?.common?.msgId || data?.msgId;
    if (!id || !Number.isInteger(count) || count < 1) return;
    if (key) {
      const k = "like-" + key;
      if (this.seen.has(k) || !this.battle.acceptReceipt(k)) return;
      this.seen.add(k);
      if (this.seen.size > 5000)
        this.seen.delete(this.seen.values().next().value);
    }
    return this.battle.likes({
      id,
      name: data.user.nickname || data.user.uniqueId || "Viewer",
      count,
    });
  }
  gift(data) {
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
    if (giftId || giftName) {
      const key = giftId || giftName;
      this.battle.giftCatalog?.set(key, {
        giftId,
        giftName,
        coins: Number.isFinite(coins) && coins > 0 ? coins : null,
        source: this.source,
      });
      if (this.battle.giftCatalog?.size > 200)
        this.battle.giftCatalog.delete(
          this.battle.giftCatalog.keys().next().value,
        );
    }
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
