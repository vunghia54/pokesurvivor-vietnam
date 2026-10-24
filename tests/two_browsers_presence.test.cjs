const test = require('node:test');
const assert = require('node:assert/strict');

test('Two-Browser and Multi-Tab Realtime Presence Simulation', async () => {
  console.log('--- Kiểm thử mô phỏng 2 trình duyệt & nhiều tab kết nối Realtime Database ---');

  // Mô phỏng server Realtime Database với .info/connected và onDisconnect
  class MockRTDBServer {
    constructor() {
      this.presence = {};
      this.listeners = [];
      this.disconnectHooks = new Map(); // connId -> hook
    }

    onValue(callback) {
      this.listeners.push(callback);
      callback(this.getSnapshot());
      return () => {
        this.listeners = this.listeners.filter(cb => cb !== callback);
      };
    }

    notify() {
      const snap = this.getSnapshot();
      for (const cb of this.listeners) cb(snap);
    }

    getSnapshot() {
      return {
        val: () => JSON.parse(JSON.stringify(this.presence)),
        numChildren: () => Object.keys(this.presence).length
      };
    }

    registerConnection(uid, connId) {
      if (!this.presence[uid]) this.presence[uid] = {};
      this.presence[uid][connId] = { at: Date.now() };

      // onDisconnect hook
      const hook = () => {
        if (this.presence[uid]) {
          delete this.presence[uid][connId];
          if (Object.keys(this.presence[uid]).length === 0) {
            delete this.presence[uid]; // Pruned automatically
          }
          this.notify();
        }
      };
      this.disconnectHooks.set(connId, hook);
      this.notify();
    }

    disconnect(connId) {
      const hook = this.disconnectHooks.get(connId);
      if (hook) {
        hook();
        this.disconnectHooks.delete(connId);
      }
    }
  }

  const server = new MockRTDBServer();

  // Client 1 (Trình duyệt A - Người dùng 1)
  const clientA_counts = [];
  const unsubA = server.onValue(snap => {
    clientA_counts.push(snap.numChildren());
  });

  // Client 2 (Trình duyệt B - Người dùng 2)
  const clientB_counts = [];
  const unsubB = server.onValue(snap => {
    clientB_counts.push(snap.numChildren());
  });

  // 1. Trình duyệt A mở website -> kết nối
  server.registerConnection('uid_alice', 'conn_tab1');
  assert.equal(clientA_counts.at(-1), 1, 'Trình duyệt A thấy 1 người online');
  assert.equal(clientB_counts.at(-1), 1, 'Trình duyệt B thấy 1 người online');

  // 2. Trình duyệt B mở website -> kết nối
  server.registerConnection('uid_bob', 'conn_tab2');
  assert.equal(clientA_counts.at(-1), 2, 'Trình duyệt A thấy 2 người online');
  assert.equal(clientB_counts.at(-1), 2, 'Trình duyệt B thấy 2 người online');

  // 3. Trình duyệt A mở thêm Tab thứ 2 (cùng tài khoản uid_alice)
  server.registerConnection('uid_alice', 'conn_tab3');
  assert.equal(clientA_counts.at(-1), 2, 'Mở thêm tab cùng UID không làm tăng số đếm (vẫn 2)');
  assert.equal(clientB_counts.at(-1), 2, 'Trình duyệt B vẫn thấy 2');

  // 4. Trình duyệt A đóng Tab thứ nhất (conn_tab1)
  server.disconnect('conn_tab1');
  assert.equal(clientA_counts.at(-1), 2, 'Đóng 1 tab trong khi tab khác còn mở: Alice vẫn online (vẫn 2)');

  // 5. Trình duyệt B đóng tab (conn_tab2)
  server.disconnect('conn_tab2');
  assert.equal(clientA_counts.at(-1), 1, 'Trình duyệt B thoát: số online giảm xuống 1');

  // 6. Trình duyệt A đóng tab cuối cùng (conn_tab3)
  server.disconnect('conn_tab3');
  assert.equal(clientA_counts.at(-1), 0, 'Tất cả thoát: số online về 0');

  unsubA();
  unsubB();
  console.log('✓ Hoàn thành kiểm thử logic 2 trình duyệt và đa tab!');
});
