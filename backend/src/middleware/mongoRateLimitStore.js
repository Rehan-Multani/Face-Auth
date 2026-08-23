const RateLimitCounter = require('../models/RateLimitCounter');

/**
 * express-rate-limit v7 `Store` implementation backed by MongoDB, so limits
 * hold correctly across ephemeral / multi-instance serverless invocations
 * (Vercel), where the built-in in-memory store resets on every cold start
 * and is not shared between concurrent instances.
 *
 * increment() uses a single aggregation-pipeline `findOneAndUpdate`, which
 * MongoDB executes atomically server-side: "increment if the current window
 * is still active, otherwise start a fresh window at 1" happens in one
 * round trip with no read-then-write race between concurrent requests
 * hitting the same key.
 */
class MongoRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.windowMs = 60 * 1000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  keyFor(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    const now = new Date();
    const freshResetTime = new Date(now.getTime() + this.windowMs);

    const doc = await RateLimitCounter.findOneAndUpdate(
      { key: this.keyFor(key) },
      [
        {
          $set: {
            totalHits: {
              $cond: [
                { $gt: ['$expiresAt', now] },
                { $add: [{ $ifNull: ['$totalHits', 0] }, 1] },
                1,
              ],
            },
            expiresAt: {
              $cond: [{ $gt: ['$expiresAt', now] }, '$expiresAt', freshResetTime],
            },
          },
        },
      ],
      { upsert: true, new: true }
    );

    return { totalHits: doc.totalHits, resetTime: doc.expiresAt };
  }

  async decrement(key) {
    await RateLimitCounter.updateOne(
      { key: this.keyFor(key), totalHits: { $gt: 0 } },
      { $inc: { totalHits: -1 } }
    );
  }

  async resetKey(key) {
    await RateLimitCounter.deleteOne({ key: this.keyFor(key) });
  }
}

module.exports = MongoRateLimitStore;
