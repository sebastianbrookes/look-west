import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const BASE_USER = {
  name: "Avery",
  email: "avery@example.com",
  latitude: 32.7765,
  longitude: -79.9311,
  locationName: "Charleston, SC",
  timezone: "America/New_York",
};

describe("users unsubscribe flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("unsubscribes the correct user with a valid token", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);

    const createdUser = await t.run((ctx) => ctx.db.get(userId));
    expect(createdUser).not.toBeNull();

    // Confirm first so the user is active before unsubscribing
    await t.mutation(api.users.confirmByToken, {
      token: createdUser!.unsubscribeToken,
    });

    const confirmedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(confirmedUser?.active).toBe(true);

    await t.mutation(api.users.unsubscribeByToken, {
      token: confirmedUser!.unsubscribeToken,
    });

    const updatedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(updatedUser?.active).toBe(false);
    expect(updatedUser?.unsubscribeToken).toBeUndefined();
  });

  it("rejects an invalid token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.users.addUser, BASE_USER);

    await expect(
      t.mutation(api.users.unsubscribeByToken, { token: "not-a-real-token" })
    ).rejects.toThrowError("Invalid unsubscribe link.");
  });

  it("clears token on unsubscribe so old links stop working", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const createdUser = await t.run((ctx) => ctx.db.get(userId));
    const token = createdUser!.unsubscribeToken;

    // Confirm first, then unsubscribe
    await t.mutation(api.users.confirmByToken, { token });
    await t.mutation(api.users.unsubscribeByToken, { token });

    const updatedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(updatedUser?.active).toBe(false);
    expect(updatedUser?.unsubscribeToken).toBeUndefined();

    // Old token no longer works for confirm or unsubscribe
    await expect(
      t.mutation(api.users.unsubscribeByToken, { token })
    ).rejects.toThrowError("Invalid unsubscribe link.");
    await expect(
      t.mutation(api.users.confirmByToken, { token })
    ).rejects.toThrowError("Invalid confirmation link.");
  });

  it("rotates old tokens when an inactive user re-subscribes", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const originalUser = await t.run((ctx) => ctx.db.get(userId));
    const originalToken = originalUser!.unsubscribeToken;

    // Confirm, then unsubscribe (which clears the token)
    await t.mutation(api.users.confirmByToken, { token: originalToken });
    await t.mutation(api.users.unsubscribeByToken, { token: originalToken });

    // Re-signup — user should be inactive with a new token
    await t.mutation(api.users.addUser, {
      ...BASE_USER,
      locationName: "Savannah, GA",
      latitude: 32.0809,
      longitude: -81.0912,
    });

    const reactivatedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(reactivatedUser?.active).toBe(false);
    expect(reactivatedUser?.unsubscribeToken).toBeDefined();
    expect(reactivatedUser?.unsubscribeToken).not.toBe(originalToken);

    // Old token no longer works
    await expect(
      t.mutation(api.users.confirmByToken, { token: originalToken })
    ).rejects.toThrowError("Invalid confirmation link.");

    // New token works for confirmation
    await t.mutation(api.users.confirmByToken, {
      token: reactivatedUser!.unsubscribeToken,
    });

    const confirmedAgain = await t.run((ctx) => ctx.db.get(userId));
    expect(confirmedAgain?.active).toBe(true);
  });

  it("generates a replacement token if a collision occurs", async () => {
    const t = convexTest(schema, modules);
    const randomValuesSpy = vi.spyOn(crypto, "getRandomValues");
    const firstTokenBytes = new Uint8Array(32).fill(1);
    const secondTokenBytes = new Uint8Array(32).fill(2);

    randomValuesSpy
      .mockImplementationOnce((array) => {
        array.set(firstTokenBytes);
        return array;
      })
      .mockImplementationOnce((array) => {
        array.set(firstTokenBytes);
        return array;
      })
      .mockImplementationOnce((array) => {
        array.set(secondTokenBytes);
        return array;
      });

    const firstUserId = await t.mutation(api.users.addUser, BASE_USER);
    await t.mutation(api.users.addUser, {
      ...BASE_USER,
      email: "another@example.com",
      name: "Jordan",
    });

    const firstUser = await t.run((ctx) => ctx.db.get(firstUserId));
    const allUsers = await t.run((ctx) => ctx.db.query("users").collect());
    const secondUser = allUsers.find((user) => user.email === "another@example.com");

    expect(firstUser?.unsubscribeToken).toBeDefined();
    expect(secondUser?.unsubscribeToken).toBeDefined();
    expect(secondUser?.unsubscribeToken).not.toBe(firstUser?.unsubscribeToken);
  });

  it("backfills tokens for legacy active users without one", async () => {
    const t = convexTest(schema, modules);
    const legacyUserId = await t.run((ctx) =>
      ctx.db.insert("users", {
        ...BASE_USER,
        active: true,
        createdAt: Date.now(),
      } as {
        name: string;
        email: string;
        latitude: number;
        longitude: number;
        locationName: string;
        timezone: string;
        active: boolean;
        createdAt: number;
      })
    );

    const updatedCount = await t.mutation(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      let updatedCount = 0;

      for (const user of users) {
        if (user.unsubscribeToken) {
          continue;
        }

        await ctx.db.patch(user._id, {
          unsubscribeToken: "backfilled-token",
        });
        updatedCount += 1;
      }

      return updatedCount;
    });

    const legacyUser = await t.run((ctx) =>
      ctx.db.get(legacyUserId as Id<"users">)
    );
    expect(updatedCount).toBe(1);
    expect(legacyUser?.unsubscribeToken).toBeDefined();
    expect(legacyUser?.unsubscribeToken?.length).toBeGreaterThan(0);
  });
});

describe("users confirm flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms a user with a valid token", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);

    const createdUser = await t.run((ctx) => ctx.db.get(userId));
    expect(createdUser?.active).toBe(false);

    await t.mutation(api.users.confirmByToken, {
      token: createdUser!.unsubscribeToken,
    });

    const confirmedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(confirmedUser?.active).toBe(true);
  });

  it("rejects an invalid token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.users.addUser, BASE_USER);

    await expect(
      t.mutation(api.users.confirmByToken, { token: "not-a-real-token" })
    ).rejects.toThrowError("Invalid confirmation link.");
  });

  it("is idempotent for repeated confirm calls", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const createdUser = await t.run((ctx) => ctx.db.get(userId));
    const token = createdUser!.unsubscribeToken;

    await t.mutation(api.users.confirmByToken, { token });
    await t.mutation(api.users.confirmByToken, { token });

    const confirmedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(confirmedUser?.active).toBe(true);
  });

  it("confirm link stops working after unsubscribe", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const createdUser = await t.run((ctx) => ctx.db.get(userId));
    const token = createdUser!.unsubscribeToken;

    // Confirm, then unsubscribe
    await t.mutation(api.users.confirmByToken, { token });
    await t.mutation(api.users.unsubscribeByToken, { token });

    // Token is cleared — confirm link no longer works
    await expect(
      t.mutation(api.users.confirmByToken, { token })
    ).rejects.toThrowError("Invalid confirmation link.");
  });

  it("full cycle: signup → confirm → unsubscribe → re-signup → confirm", async () => {
    const t = convexTest(schema, modules);

    // Sign up and confirm
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const user1 = await t.run((ctx) => ctx.db.get(userId));
    await t.mutation(api.users.confirmByToken, { token: user1!.unsubscribeToken });

    // Unsubscribe
    await t.mutation(api.users.unsubscribeByToken, { token: user1!.unsubscribeToken });

    // Re-signup
    await t.mutation(api.users.addUser, BASE_USER);
    const user2 = await t.run((ctx) => ctx.db.get(userId));
    expect(user2?.active).toBe(false);
    expect(user2?.unsubscribeToken).toBeDefined();

    // Confirm with new token
    await t.mutation(api.users.confirmByToken, { token: user2!.unsubscribeToken });
    const user3 = await t.run((ctx) => ctx.db.get(userId));
    expect(user3?.active).toBe(true);
  });
});

describe("signup global rate limiting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows signups within the global rate limit", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.users.addUser, BASE_USER);
    await t.mutation(api.users.addUser, {
      ...BASE_USER,
      email: "other@example.com",
      name: "Jordan",
    });

    const allUsers = await t.run((ctx) => ctx.db.query("users").collect());
    expect(allUsers).toHaveLength(2);
  });

  it("blocks signups when the global rate limit is exhausted", async () => {
    const t = convexTest(schema, modules);

    // Exhaust the global rate limit (capacity = 50)
    for (let i = 0; i < 50; i++) {
      await t.mutation(api.users.addUser, {
        ...BASE_USER,
        email: `user${i}@example.com`,
        name: `User ${i}`,
      });
    }

    // The 51st signup should be rate limited
    await expect(
      t.mutation(api.users.addUser, {
        ...BASE_USER,
        email: "onemore@example.com",
        name: "One More",
      })
    ).rejects.toThrowError("Too many signup attempts. Please try again later.");
  });
});
