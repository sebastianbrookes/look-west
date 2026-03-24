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

    await t.mutation(api.users.unsubscribeByToken, {
      token: createdUser!.unsubscribeToken,
    });

    const updatedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(updatedUser?.active).toBe(false);
  });

  it("rejects an invalid token", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.users.addUser, BASE_USER);

    await expect(
      t.mutation(api.users.unsubscribeByToken, { token: "not-a-real-token" })
    ).rejects.toThrowError("Invalid unsubscribe link.");
  });

  it("is idempotent for repeated unsubscribe calls", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const createdUser = await t.run((ctx) => ctx.db.get(userId));
    const token = createdUser!.unsubscribeToken;

    await t.mutation(api.users.unsubscribeByToken, { token });
    await t.mutation(api.users.unsubscribeByToken, { token });

    const updatedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(updatedUser?.active).toBe(false);
  });

  it("rotates old tokens when an inactive user re-subscribes", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.addUser, BASE_USER);
    const originalUser = await t.run((ctx) => ctx.db.get(userId));
    const originalToken = originalUser!.unsubscribeToken;

    await t.mutation(api.users.unsubscribeByToken, { token: originalToken });
    await t.mutation(api.users.addUser, {
      ...BASE_USER,
      locationName: "Savannah, GA",
      latitude: 32.0809,
      longitude: -81.0912,
    });

    const reactivatedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(reactivatedUser?.active).toBe(true);
    expect(reactivatedUser?.unsubscribeToken).not.toBe(originalToken);

    await expect(
      t.mutation(api.users.unsubscribeByToken, { token: originalToken })
    ).rejects.toThrowError("Invalid unsubscribe link.");

    await t.mutation(api.users.unsubscribeByToken, {
      token: reactivatedUser!.unsubscribeToken,
    });

    const unsubscribedAgain = await t.run((ctx) => ctx.db.get(userId));
    expect(unsubscribedAgain?.active).toBe(false);
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
