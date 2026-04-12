import type {
  FastifyRequest,
  FastifyReply,
  HookHandlerDoneFunction,
} from "fastify";
import { config } from "./config.js";

export interface UserContext {
  oid: string;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: UserContext;
  }
}

const DEV_USER: UserContext = {
  oid: "00000000-0000-0000-0000-000000000000",
  email: "dev@localhost",
  name: "Dev User",
};

/** Routes that skip auth (K8s probes, etc.) */
const PUBLIC_PATHS = new Set(["/health"]);

/**
 * Extracts user identity from Envoy Gateway headers or applies dev bypass.
 * The gateway validates JWTs and injects claims via `claimToHeaders` —
 * this service trusts those headers unconditionally.
 */
function extractUser(req: FastifyRequest): UserContext | null {
  const oid = req.headers["x-user-oid"] as string | undefined;
  const email = req.headers["x-user-email"] as string | undefined;
  const name = (req.headers["x-user-name"] as string | undefined) ?? "";

  if (oid && email) {
    return { oid, email, name };
  }

  if (config.DEV_BYPASS_AUTH) {
    return DEV_USER;
  }

  return null;
}

/**
 * Fastify onRequest hook — attaches user context or returns 401.
 */
export function authHook(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (PUBLIC_PATHS.has(req.url.split("?")[0])) {
    done();
    return;
  }

  const user = extractUser(req);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  req.user = user;
  done();
}

export { extractUser };
