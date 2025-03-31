import Database from 'better-sqlite3';
import { BeaconRecord, DeviceLocationRecord } from '../types';
import path from 'path';

class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * データベースの初期化
   */
  private initialize(): void {
    // ビーコンテーブルの作成
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS beacons (
        id TEXT PRIMARY KEY,
        zone TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `);

    // デバイス位置テーブルの作成
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mac_address TEXT NOT NULL,
        name TEXT,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        rssi_values TEXT NOT NULL,
        UNIQUE(mac_address)
      );
    `);

    console.log('データベースが初期化されました');
  }

  /**
   * ビーコン情報を保存または更新
   */
  public saveBeacon(beacon: BeaconRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO beacons (id, zone, x, y, last_seen)
      VALUES (@id, @zone, @x, @y, @last_seen)
      ON CONFLICT(id) DO UPDATE SET
        zone = @zone,
        x = @x,
        y = @y,
        last_seen = @last_seen
    `);

    stmt.run(beacon);
  }

  /**
   * すべてのビーコン情報を取得
   */
  public getAllBeacons(): BeaconRecord[] {
    const stmt = this.db.prepare('SELECT * FROM beacons');
    return stmt.all() as BeaconRecord[];
  }

  /**
   * デバイス位置情報を保存または更新
   */
  public saveDeviceLocation(device: DeviceLocationRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO device_locations (mac_address, name, x, y, last_seen, rssi_values)
      VALUES (@mac_address, @name, @x, @y, @last_seen, @rssi_values)
      ON CONFLICT(mac_address) DO UPDATE SET
        name = COALESCE(@name, name),
        x = @x,
        y = @y,
        last_seen = @last_seen,
        rssi_values = @rssi_values
    `);

    stmt.run(device);
  }

  /**
   * すべてのデバイス位置情報を取得
   */
  public getAllDeviceLocations(): DeviceLocationRecord[] {
    const stmt = this.db.prepare('SELECT * FROM device_locations');
    return stmt.all() as DeviceLocationRecord[];
  }

  /**
   * 特定のMACアドレスを持つデバイス位置情報を取得
   */
  public getDeviceLocationByMacAddress(macAddress: string): DeviceLocationRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM device_locations WHERE mac_address = ?');
    return stmt.get(macAddress) as DeviceLocationRecord | undefined;
  }

  /**
   * 指定した期間より前の古いデバイス位置情報を削除
   */
  public cleanupOldDevices(maxAgeSeconds: number): number {
    const cutoffTime = Math.floor(Date.now() / 1000) - maxAgeSeconds;
    const stmt = this.db.prepare('DELETE FROM device_locations WHERE last_seen < ?');
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  /**
   * データベースを閉じる
   */
  public close(): void {
    this.db.close();
  }
}

// データベースのインスタンスを作成
const dbPath = path.join(__dirname, '../../data/bluetooth_tracker.db');
export const db = new DatabaseManager(dbPath);
