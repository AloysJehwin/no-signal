import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {HandoffReport} from './HandoffReport';
import {ConversationLog} from './ConversationLog';
import {LocalRagStore} from '../rag/LocalRagStore';
import {FaultTreeEntry} from '../rag/FaultTreeEntry';
import {handoffToWire, faultTreeFromWire, WireFaultTreeEntry} from './wireFormat';

const QUEUE_KEY = 'fieldfix.sync.queue.v1';
const CONV_QUEUE_KEY = 'fieldfix.training.conversations.v1';
const CLOUD_URL_KEY = 'fieldfix.cloud.baseUrl';

// Default points to the Cloud Run service; falls back to local emulator
const DEFAULT_CLOUD_URL =
  'https://nosignal-cloud-115075076514.us-central1.run.app';

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

  /** Enqueue a full turn-by-turn conversation log for the training pipeline. */
  async enqueueConversation(log: ConversationLog): Promise<void> {
    const list = await this.loadConversations();
    list.push(log);
    await AsyncStorage.setItem(CONV_QUEUE_KEY, JSON.stringify(list));
    void this.tryDrain();
  }

  async peek(): Promise<HandoffReport[]> {
    return this.load();
  }

  watchConnectivity(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void this.tryDrain();
      }
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

      if (sent.length > 0) {
        // Pull updated fleet fault-trees back into Local RAG
        await this.pullFaultTrees(baseUrl);
        // Trigger continuous learning for topics we just drained
        await this.triggerContinuousLearn(baseUrl, sent);
      }

      // Also flush any queued conversation logs to the training pipeline.
      await this.drainConversations(baseUrl);

      return sent;
    } finally {
      this.draining = false;
    }
  }

  private async drainConversations(baseUrl: string): Promise<void> {
    const logs = await this.loadConversations();
    if (logs.length === 0) return;
    try {
      const res = await fetch(`${baseUrl}/api/training/offline-conversations`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(logs),
      });
      if (res.ok) {
        await AsyncStorage.setItem(CONV_QUEUE_KEY, JSON.stringify([]));
        // Pull refreshed fault-trees since the cloud may have minted new entries
        await this.pullFaultTrees(baseUrl);
      }
    } catch {
      // network failure — keep the queue for the next drain
    }
  }

  private async loadConversations(): Promise<ConversationLog[]> {
    const raw = await AsyncStorage.getItem(CONV_QUEUE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ConversationLog[];
    } catch {
      return [];
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

  /** POST to /api/sync/ (new router prefix). Converts camelCase → snake_case at the wire boundary. */
  private async postReport(baseUrl: string, report: HandoffReport): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/sync/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify([handoffToWire(report)]),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** GET /api/sync/fault-trees and upsert into local SQLite RAG (snake→camel). */
  private async pullFaultTrees(baseUrl: string): Promise<void> {
    try {
      const res = await fetch(`${baseUrl}/api/sync/fault-trees`);
      if (!res.ok) return;
      const wireEntries = (await res.json()) as WireFaultTreeEntry[];
      const entries: FaultTreeEntry[] = wireEntries.map(faultTreeFromWire);
      for (const e of entries) await LocalRagStore.instance.upsertEntry(e);
    } catch {
      // ignore, retry on next connectivity event
    }
  }

  /**
   * POST to /api/training/continuous-learn for each unique equipment type
   * in the drained reports so the cloud pre-fetches fresh web knowledge.
   */
  private async triggerContinuousLearn(
    baseUrl: string,
    reports: HandoffReport[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const r of reports) {
      const key = `${r.equipmentType}:${r.leadingHypothesis}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await fetch(`${baseUrl}/api/training/continuous-learn`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            query: `${r.equipmentType} ${r.leadingHypothesis} repair diagnosis`,
            equipment_type: r.equipmentType,
          }),
        });
      } catch {
        // best-effort; ignore
      }
    }
    // Pull updated fault-trees again after learning
    await this.pullFaultTrees(baseUrl);
  }
}
