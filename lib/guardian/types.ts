export type RuleMode = "ignore" | "always";

export interface ScanRecord {
  id: string;
  token: string; // 보호자 보기 링크용 capability 토큰
  createdAt: string; // ISO
  senderKey: string;
  sender: string;
  message: string;
  action: string;
  important: boolean;
  speech: string;
  imagePath: string; // Blob pathname
  imageMediaType: string;
  notified: boolean;
}

export interface GuardianStore {
  getRule(senderKey: string): Promise<RuleMode | null>;
  setRule(senderKey: string, mode: RuleMode | null): Promise<void>;
  hasPriorScan(senderKey: string): Promise<boolean>;
  saveScan(scan: ScanRecord): Promise<void>;
  getScanByToken(token: string): Promise<ScanRecord | null>;
  recentScans(limit: number): Promise<ScanRecord[]>;
  getGuardianPhone(): Promise<string | null>;
  setGuardianPhone(phone: string): Promise<void>;
}

export interface ImageStore {
  upload(data: Buffer, mediaType: string, pathname: string): Promise<void>;
  getStream(
    pathname: string,
  ): Promise<{ stream: ReadableStream; contentType: string } | null>;
}

export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export interface GuardianDeps {
  store: GuardianStore;
  images: ImageStore;
  sms: SmsSender | null; // SMS env 미설정 시 null — 알림만 꺼짐
  baseUrl: string; // 링크 생성용, 예: https://read-it-to-me.vercel.app
}
