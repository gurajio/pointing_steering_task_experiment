(function (root) {
  'use strict';
  class SessionStore {
    constructor() { this.db = null; this.queue = Promise.resolve(); this.failure = null; this.pending = 0; this.release = null; }
    async open() {
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('pointing-experiment-v1', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('sessions', {keyPath: 'sessionId'});
          for (const [name, key] of Object.entries({trials: 'attemptId', clicks: 'clickId', events: 'eventId', trajectoryChunks: 'chunkId'})) {
            db.createObjectStore(name, {keyPath: key}).createIndex('sessionId', 'sessionId', {unique: false});
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(Error('保存領域が別のタブで使用されています。該当するタブを閉じて再読込みしてください。'));
      });
      this.db.onversionchange = () => this.db.close();
    }
    async acquire(id) {
      if (!navigator.locks) throw Error('このブラウザでは実行タブの排他制御を利用できません。最新版のChromeまたはEdgeでlocalhostから開いてください。');
      this.unlock();
      return new Promise((resolve, reject) => {
        navigator.locks.request(`pointing-session:${id}`, {ifAvailable: true}, lock => {
          if (!lock) { resolve(false); return; }
          resolve(true);
          return new Promise(done => { this.release = done; });
        }).catch(reject);
      });
    }
    unlock() { if (this.release) { this.release(); this.release = null; } }
    write(batch) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['sessions', 'trials', 'clicks', 'events', 'trajectoryChunks'], 'readwrite');
        tx.objectStore('sessions').put(batch.meta);
        for (const key of ['trials', 'clicks', 'events', 'trajectoryChunks']) for (const row of batch[key]) tx.objectStore(key).put(row);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || Error('チェックポイントの保存に失敗しました。'));
        tx.onabort = () => reject(tx.error || Error('保存トランザクションが中断されました。'));
      });
    }
    save(batch) {
      this.pending++;
      const operation = this.queue.then(() => {
        if (this.failure) throw this.failure;
        return this.write(batch);
      });
      this.queue = operation.catch(error => { this.failure = error; }).finally(() => { this.pending--; });
      return operation;
    }
    async flush() { await this.queue; if (this.failure) throw this.failure; }
    async retry(batch) { await this.queue; this.failure = null; await this.save(batch); await this.flush(); }
    async list() {
      return new Promise((resolve, reject) => {
        const request = this.db.transaction('sessions').objectStore('sessions').getAll();
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)));
        request.onerror = () => reject(request.error);
      });
    }
    async load(id) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(['sessions', 'trials', 'clicks', 'events', 'trajectoryChunks']);
        let session;
        const arrays = {};
        const request = tx.objectStore('sessions').get(id);
        request.onsuccess = () => { session = request.result; };
        for (const name of ['trials', 'clicks', 'events', 'trajectoryChunks']) {
          const request = tx.objectStore(name).index('sessionId').getAll(id);
          request.onsuccess = () => { arrays[name] = request.result; };
        }
        tx.oncomplete = () => {
          if (!session) { reject(Error('指定したセッションがありません。')); return; }
          for (const [key, index] of Object.entries({trials: 'rowIndex', clicks: 'clickIndex', events: 'eventIndex', trajectoryChunks: 'chunkIndex'})) arrays[key].sort((a, b) => a[index] - b[index]);
          resolve({...session, ...arrays});
        };
        tx.onerror = () => reject(tx.error);
      });
    }
  }
  root.SessionStore = SessionStore;
})(globalThis);
