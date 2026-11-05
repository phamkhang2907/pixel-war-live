// TikTok-Live-Connector 2.5 native events use nested user/giftDetails/common.
export class TikTokIngest {
  constructor(battle) {
    this.battle = battle;
    this.seen = new Set();
  }
  chat(data) {
    const id = data.user?.userId;
    const comment = String(data.comment || "").trim();
    if (id && (comment === "1" || comment === "2"))
      this.battle.choose(id, Number(comment) - 1);
  }
  like(data) {
    const id = data?.user?.userId,
      count = Number(data?.likeCount),
      key = data?.common?.msgId || data?.msgId;
    if (!id || !Number.isInteger(count) || count < 1) return;
    if (key) {
      const k = "like-" + key;
      if (this.seen.has(k)) return;
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
    const id = data.user?.userId,
      details = data.giftDetails;
    if (!id || !details || !(Number(details.diamondCount) > 0)) return;
    if (Number(details.giftType) === 1 && !data.repeatEnd) return;
    const key = String(
      data.common?.msgId ||
        data.msgId ||
        `${id}-${data.giftId}-${data.repeatCount}-${data.common?.createTime}`,
    );
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 5000)
      this.seen.delete(this.seen.values().next().value);
    return this.battle.gift({
      id,
      name: data.user.nickname || data.user.uniqueId || "Viewer",
      coins: details.diamondCount,
      count: data.repeatCount,
    });
  }
}
