import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { getConfig } from "./config";

let cached: { key: string; client: PlaidApi } | null = null;

/** Plaid client for the current settings; rebuilt if the keys or environment change. */
export function getPlaid(): PlaidApi {
  const { plaidClientId, plaidSecret, plaidEnv } = getConfig();
  const key = `${plaidEnv}:${plaidClientId}:${plaidSecret}`;
  if (cached?.key !== key) {
    const client = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[plaidEnv],
        baseOptions: { headers: { "PLAID-CLIENT-ID": plaidClientId, "PLAID-SECRET": plaidSecret } },
      }),
    );
    cached = { key, client };
  }
  return cached.client;
}

export function getPlaidEnv() {
  return getConfig().plaidEnv;
}

export function plaidConfigured(): boolean {
  const { plaidClientId, plaidSecret } = getConfig();
  return Boolean(plaidClientId && plaidSecret);
}

/** Pull a readable message out of a Plaid/axios error without leaking tokens. */
export function plaidErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } })
    ?.response?.data;
  if (data?.error_code) return `${data.error_code}: ${data.error_message ?? ""}`.trim();
  return err instanceof Error ? err.message : String(err);
}
