const LOCAL_BACK_URL = "http://localhost:3000";
const DOCKER_COMPOSE_BACK_URL = "http://back:3000";
/** Fallback Render — override with BACK_URL env var in production. */
const RENDER_BACK_URL = "https://president-api-swcg.onrender.com";

export function resolveBackUrl(): string {
    const explicit = process.env.BACK_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/$/, "");
    }

    if (process.env.NODE_ENV !== "production") {
        return LOCAL_BACK_URL;
    }

    // Docker Compose sets BACK_URL; this covers Render and other split deployments.
    return RENDER_BACK_URL;
}

export function resolveMatchEndUrl(): string {
    const backUrl = resolveBackUrl();
    try {
        return new URL("/api/match/end", backUrl).toString();
    } catch {
        return `${backUrl}/api/match/end`.replace(/([^:])\/\//g, "$1/");
    }
}

export function logBackUrlConfig(): void {
    const backUrl = resolveBackUrl();
    const source = process.env.BACK_URL
        ? "BACK_URL env"
        : process.env.NODE_ENV !== "production"
          ? "local default"
          : "production fallback (set BACK_URL to override)";

    console.log(`[config] MMR backend URL: ${backUrl} (${source})`);
}
