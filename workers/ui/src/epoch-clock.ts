// EpochClock — the single global era state (PLAN §3): classical → quantum and the
// CRQC progress %. A Durable Object so mutations are serialized (no races between
// the admin lever and the epoch-tick cron). It's a thin, strongly-consistent
// wrapper over the active crypto_config row, which is the cross-worker read view
// (the seal + break paths read era/CRQC from there over Neon).
import { DurableObject } from "cloudflare:workers";
import { cryptoConfigRepo, getDb } from "@qstd/db";
import type { Database } from "@qstd/db";

export interface EpochClockEnv {
  readonly NEON_DATABASE_URL: string;
}

export interface EpochState {
  era: "classical" | "quantum";
  crqcProgress: number;
  breakMode: "genuine" | "projected";
  scheme: string;
  autoGenerate: boolean;
  autoTick: boolean;
}

const clampProgress = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export class EpochClock extends DurableObject<EpochClockEnv> {
  #db(): Database {
    return getDb(this.env.NEON_DATABASE_URL);
  }

  async getState(): Promise<EpochState> {
    return toState(await cryptoConfigRepo(this.#db()).ensureActive());
  }

  /** The big switch: jump to the quantum era and complete the countdown. */
  async advanceEra(): Promise<EpochState> {
    return this.#commit("quantum", 100);
  }

  /** Set CRQC progress; reaching 100 implies the quantum era has arrived. */
  async setProgress(progress: number): Promise<EpochState> {
    const p = clampProgress(progress);
    return this.#commit(p >= 100 ? "quantum" : "classical", p);
  }

  /** epoch-tick cron: nudge the CRQC countdown forward; flip to quantum at 100%. */
  async tick(step = 10): Promise<EpochState> {
    const current = await this.getState();
    if (current.era === "quantum") return current; // already arrived
    return this.setProgress(current.crqcProgress + step);
  }

  /** Back to today — classical era, countdown reset (demo reset). */
  async reset(): Promise<EpochState> {
    return this.#commit("classical", 0);
  }

  async #commit(era: "classical" | "quantum", crqcProgress: number): Promise<EpochState> {
    return toState(await cryptoConfigRepo(this.#db()).setEra({ era, crqcProgress }));
  }
}

function toState(c: {
  era: "classical" | "quantum";
  crqcProgress: number;
  breakMode: "genuine" | "projected";
  scheme: string;
  autoGenerate: boolean;
  autoTick: boolean;
}): EpochState {
  return {
    era: c.era,
    crqcProgress: c.crqcProgress,
    breakMode: c.breakMode,
    scheme: c.scheme,
    autoGenerate: c.autoGenerate,
    autoTick: c.autoTick,
  };
}
