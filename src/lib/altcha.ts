/**
 * Client side of ALTCHA proof-of-work verification (altcha.org protocol).
 *
 * A Web Worker brute-forces SHA-256(salt + number) === challenge in parallel
 * batches so the main thread never blocks; typical solve time for the
 * server's difficulty (maxnumber = 60,000) is well under a second. The result
 * is submitted as base64(JSON payload), the same wire format the official
 * ALTCHA widget uses.
 */

import { api } from "../api";

export interface AltchaChallenge {
  algorithm: string;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

/* Web Worker source (blob URL - CSP allows worker-src blob:). */
const SOLVER_SRC = `self.onmessage = async (e) => {
  const { salt, challenge, maxnumber } = e.data;
  const enc = new TextEncoder();
  const BATCH = 64;
  for (let start = 0; start <= maxnumber; start += BATCH) {
    const end = Math.min(start + BATCH, maxnumber + 1);
    const digests = await Promise.all(
      Array.from({ length: end - start }, (_, i) =>
        crypto.subtle.digest("SHA-256", enc.encode(salt + (start + i)))
      )
    );
    for (let i = 0; i < digests.length; i++) {
      const bytes = new Uint8Array(digests[i]);
      let hex = "";
      for (let j = 0; j < bytes.length; j++) hex += bytes[j].toString(16).padStart(2, "0");
      if (hex === challenge) { self.postMessage({ number: start + i }); return; }
    }
  }
  self.postMessage({ number: null });
};`;

export function fetchChallenge(): Promise<AltchaChallenge> {
  return api<AltchaChallenge>("/api/altcha/challenge");
}

/** Solve the puzzle off the main thread. Rejects on timeout or worker error. */
export function solveChallenge(ch: AltchaChallenge, timeoutMs = 20_000): Promise<number> {
  return new Promise((resolve, reject) => {
    let url: string | null = URL.createObjectURL(new Blob([SOLVER_SRC], { type: "text/javascript" }));
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      reject(new Error("Could not start the verification worker."));
      return;
    }

    const cleanup = () => {
      window.clearTimeout(timer);
      worker.terminate();
      if (url) URL.revokeObjectURL(url);
      url = null;
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Verification timed out - please try again."));
    }, timeoutMs);

    worker.onmessage = (e: MessageEvent<{ number: number | null }>) => {
      cleanup();
      if (e.data.number === null) reject(new Error("Verification failed - please try again."));
      else resolve(e.data.number);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("Verification worker crashed - please try again."));
    };

    worker.postMessage({ salt: ch.salt, challenge: ch.challenge, maxnumber: ch.maxnumber });
  });
}

/** Official ALTCHA wire format: base64(JSON) carried in the "altcha" field. */
export function encodePayload(ch: AltchaChallenge, number: number): string {
  return btoa(
    JSON.stringify({
      algorithm: ch.algorithm,
      challenge: ch.challenge,
      number,
      salt: ch.salt,
      signature: ch.signature,
    })
  );
}
