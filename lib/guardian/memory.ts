import type {
  GuardianStore,
  ImageStore,
  RuleMode,
  ScanRecord,
  SmsSender,
} from "./types";

export function createMemoryStore(): GuardianStore {
  const scans: ScanRecord[] = []; // 최신이 앞
  const rules = new Map<string, RuleMode>();
  let phone: string | null = null;

  return {
    async getRule(senderKey) {
      return rules.get(senderKey) ?? null;
    },
    async setRule(senderKey, mode) {
      if (mode === null) rules.delete(senderKey);
      else rules.set(senderKey, mode);
    },
    async hasPriorScan(senderKey) {
      return scans.some((s) => s.senderKey === senderKey);
    },
    async saveScan(scan) {
      scans.unshift(scan);
    },
    async getScanByToken(token) {
      return scans.find((s) => s.token === token) ?? null;
    },
    async recentScans(limit) {
      return scans.slice(0, limit);
    },
    async getGuardianPhone() {
      return phone;
    },
    async setGuardianPhone(next) {
      phone = next;
    },
  };
}

export function createMemoryImages(): ImageStore & {
  files: Map<string, { data: Buffer; mediaType: string }>;
} {
  const files = new Map<string, { data: Buffer; mediaType: string }>();
  return {
    files,
    async upload(data, mediaType, pathname) {
      files.set(pathname, { data, mediaType });
    },
    async getStream(pathname) {
      const f = files.get(pathname);
      if (!f) return null;
      return {
        stream: new Blob([new Uint8Array(f.data)]).stream(),
        contentType: f.mediaType,
      };
    },
  };
}

export function createMemorySms(): SmsSender & {
  sent: { to: string; text: string }[];
} {
  const sent: { to: string; text: string }[] = [];
  return {
    sent,
    async send(to, text) {
      sent.push({ to, text });
    },
  };
}
