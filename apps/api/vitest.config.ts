import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * Every test file in this workspace talks to the *same* local Postgres, and
     * several matrix assertions are written against global state rather than
     * against their own fixtures — for example "the customer sees exactly these
     * two published shops". Vitest's default is one worker per file, so those
     * files were racing each other: a suite that published a shop or ran a
     * shop-wide sweeper mid-flight made an unrelated suite fail, and the same run
     * would pass on its own afterwards.
     *
     * That was latent before Phase 4 and only stayed quiet because no other suite
     * published a shop. Serializing files is the honest fix; the alternative is
     * loosening the global assertions, which `CURRENT-STATE.md` explicitly says
     * not to do because they are the reason fixture pollution gets caught at all.
     */
    fileParallelism: false,
    // A single database also means no two tests inside a file may interleave.
    sequence: { concurrent: false },
    // The local matrix drives Docker, Supabase auth, and dozens of HTTP round
    // trips per test; the 5s default is far too short for it.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
