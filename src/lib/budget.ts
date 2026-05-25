import { sql } from "drizzle-orm";
import { withUserDb } from "@/db/client";

const DEFAULT_DAILY_TOKEN_CAP = 200_000;
const INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

export type DailyUsage = {
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
};

export type BudgetCheck = {
  ok: boolean;
  used: number;
  cap: number;
  resetAt: Date;
};

export async function getDailyUsage(userId: string): Promise<DailyUsage> {
  return withUserDb(userId, async (tx) => {
    const [row] = await tx.execute<{
      input_tokens: string | number | null;
      output_tokens: string | number | null;
    }>(sql`
      select
        coalesce(sum(input_tokens), 0) as input_tokens,
        coalesce(sum(output_tokens), 0) as output_tokens
      from usage_events
      where user_id = ${userId}
        and created_at >= date_trunc('day', now())
    `);

    const inputTokens = Number(row?.input_tokens ?? 0);
    const outputTokens = Number(row?.output_tokens ?? 0);
    return {
      inputTokens,
      outputTokens,
      totalUsd: inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN,
    };
  });
}

export async function checkBudget(userId: string): Promise<BudgetCheck> {
  const usage = await getDailyUsage(userId);
  const used = usage.inputTokens + usage.outputTokens;
  const cap = getDailyTokenCap();
  return {
    ok: used < cap,
    used,
    cap,
    resetAt: getNextUtcMidnight(),
  };
}

export function getDailyTokenCap(): number {
  const raw = process.env.DAILY_TOKEN_CAP;
  if (!raw) return DEFAULT_DAILY_TOKEN_CAP;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_TOKEN_CAP;
}

function getNextUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
