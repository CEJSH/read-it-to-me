import { Redis } from "@upstash/redis";
import { get, put } from "@vercel/blob";
import { SolapiMessageService } from "solapi";
import type {
  GuardianDeps,
  GuardianStore,
  ImageStore,
  RuleMode,
  ScanRecord,
  SmsSender,
} from "./types";

const RECENT_KEY = "scans:recent";
const RECENT_MAX = 100;

export function createRedisStore(): GuardianStore {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  return {
    async getRule(senderKey) {
      return (await redis.get<RuleMode>(`rule:${senderKey}`)) ?? null;
    },
    async setRule(senderKey, mode) {
      if (mode === null) await redis.del(`rule:${senderKey}`);
      else await redis.set(`rule:${senderKey}`, mode);
    },
    async hasPriorScan(senderKey) {
      return (await redis.llen(`sender:${senderKey}:scans`)) > 0;
    },
    async saveScan(scan) {
      await Promise.all([
        redis.set(`scan:${scan.id}`, scan),
        redis.set(`view:${scan.token}`, scan.id),
        redis.lpush(`sender:${scan.senderKey}:scans`, scan.id),
        redis.lpush(RECENT_KEY, scan.id),
      ]);
      await redis.ltrim(RECENT_KEY, 0, RECENT_MAX - 1);
    },
    async getScanByToken(token) {
      const id = await redis.get<string>(`view:${token}`);
      if (!id) return null;
      return (await redis.get<ScanRecord>(`scan:${id}`)) ?? null;
    },
    async recentScans(limit) {
      const ids = await redis.lrange(RECENT_KEY, 0, limit - 1);
      if (ids.length === 0) return [];
      const scans = await Promise.all(
        ids.map((id) => redis.get<ScanRecord>(`scan:${id}`)),
      );
      return scans.filter((s): s is ScanRecord => s !== null);
    },
    async getGuardianPhone() {
      return (await redis.get<string>("guardian:phone")) ?? null;
    },
    async setGuardianPhone(phone) {
      await redis.set("guardian:phone", phone);
    },
  };
}

export function createBlobImages(): ImageStore {
  return {
    async upload(data, mediaType, pathname) {
      // @vercel/blob's PutBody union doesn't include Uint8Array (only Buffer,
      // string, Blob, ArrayBuffer, ReadableStream, File) — pass the Buffer
      // itself instead of the brief's `new Uint8Array(data)`.
      await put(pathname, data, {
        access: "private",
        contentType: mediaType,
      });
    },
    async getStream(pathname) {
      const result = await get(pathname, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return {
        stream: result.stream,
        contentType: result.blob.contentType || "image/jpeg",
      };
    },
  };
}

export function createSolapiSms(): SmsSender | null {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER_PHONE;
  if (!key || !secret || !from) return null;

  const service = new SolapiMessageService(key, secret);
  return {
    async send(to, text) {
      await service.send({ to, from, text });
    },
  };
}

/** Redis+Blob env가 모두 있어야 보호자 루프 활성. 없으면 null → 기존 stateless 동작. */
export function getGuardian(): GuardianDeps | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN ||
    !process.env.BLOB_READ_WRITE_TOKEN
  ) {
    return null;
  }
  return {
    store: createRedisStore(),
    images: createBlobImages(),
    sms: createSolapiSms(),
    baseUrl:
      process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
  };
}
