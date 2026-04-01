/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminDigest from "../adminDigest.js";
import type * as alertEmails from "../alertEmails.js";
import type * as alerts from "../alerts.js";
import type * as cronActions from "../cronActions.js";
import type * as crons from "../crons.js";
import type * as digestQueries from "../digestQueries.js";
import type * as emails from "../emails.js";
import type * as prompts from "../prompts.js";
import type * as quotes from "../quotes.js";
import type * as rateLimit from "../rateLimit.js";
import type * as sunsetScoring from "../sunsetScoring.js";
import type * as unsubscribeTokens from "../unsubscribeTokens.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminDigest: typeof adminDigest;
  alertEmails: typeof alertEmails;
  alerts: typeof alerts;
  cronActions: typeof cronActions;
  crons: typeof crons;
  digestQueries: typeof digestQueries;
  emails: typeof emails;
  prompts: typeof prompts;
  quotes: typeof quotes;
  rateLimit: typeof rateLimit;
  sunsetScoring: typeof sunsetScoring;
  unsubscribeTokens: typeof unsubscribeTokens;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
