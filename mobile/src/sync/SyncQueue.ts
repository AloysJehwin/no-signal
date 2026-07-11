import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {HandoffReport} from './HandoffReport';
import {LocalRagStore} from '../rag/LocalRagStore';
import {FaultTreeEntry} from '../rag/FaultTreeEntry';

const QUEUE_KEY = 'fieldfix.sync.queue.v1';
const CLOUD_URL_KEY = 'fieldfix.cloud.baseUrl';
const DEFAULT_CLOUD_URL = 'http://10.0.2.2:8000';

export class SyncQueue {
  static readonly instance = new SyncQueue();
  private draining = false;
  private unsubscribe: (() => void) | null = null;

  async enqueue(report: HandoffReport): Promise<void> {
    const list = await this.load();
    list.push(report);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    void this.tryDrain();
  }

  async peek(): Promise<HandoffReport[]> {
    return this.load();
  }

  watchConnectivity(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      if (state.isConnected && state.isInternetReachable !== false) void this.tryDrain();
    });
  }

  stopWatching(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async drain(): Promise<HandoffReport[]> {
    if (this.draining) return [];
    this.draining = true;
    try {
      const baseUrl = (await AsyncStorage.getItem(CLOUD_URL_KEY)) ?? DEFAULT_CLOUD_URL;
      const pending = await this.load();
      const sent: HandoffReport[] = [];
      for (const r of pending) {
        const ok = await this.postReport(baseUrl, r);
        if (!ok) break;
        sent.push(r);
      }
      const remaining = pending.slice(sent.length);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      if (sent.length > 0) await this.pullFaultTrees(baseUrl);
      return sent;
    } finally {
      this.draining = false;
    }
  }

  private async tryDrain(): Promise<void> {
    try {
      await this.drain();
    } catch {
      // network drain failures are expected offline; swallow.
    }
  }

  private async load(): Promise<HandoffReport[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as HandoffReport[];
    } catch {
      return [];
    }
  }

  private async postReport(baseUrl: string, report: HandoffReport): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/sync`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(report),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async pullFaultTrees(baseUrl: string): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}/fault-trees`);
      if (!res.ok) return;
      const entries = (await res.json()) as FaultTreeEntry[];
      for (const e of entries) await LocalRagStore.instance.upsertEntry(e);
    } catch {
      // ignore, retry on next connectivity event
    }
  }
}
