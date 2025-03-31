import { BeaconRecord, DeviceLocationRecord } from '../types';
import path from 'path';
import fs from 'fs';

/**
 * インメモリデータベース実装
 * ※better-sqlite3の代わりにインメモリでデータを管理
 */
class DatabaseManager {
  private beacons: Map<string, BeaconRecord> = new Map();
  private deviceLocations: Map<string, DeviceLocationRecord> = new Map();
  private nextDeviceId = 1;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.loadFromDisk();
    console.log('インメモリデータベースが初期化されました');
    
    // 定期的にディスクに保存
    setInterval(() => this.saveToDisk(), 60000); // 1分ごとに保存
  }

  /**
   * ディスクからデータを読み込む
   */
  private loadFromDisk(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ビーコンデータの読み込み
      const beaconsPath = `${this.dbPath}-beacons.json`;
      if (fs.existsSync(beaconsPath)) {
        const data = fs.readFileSync(beaconsPath, 'utf8');
        const beacons = JSON.parse(data) as BeaconRecord[];
        beacons.forEach(beacon => this.beacons.set(beacon.id, beacon));
        console.log(`${beacons.length}件のビーコンデータを読み込みました`);
      }

      // デバイス位置データの読み込み
      const locationsPath = `${this.dbPath}-devices.json`;
      if (fs.existsSync(locationsPath)) {
        const data = fs.readFileSync(locationsPath, 'utf8');
        const devices = JSON.parse(data) as DeviceLocationRecord[];
        devices.forEach(device => {
          this.deviceLocations.set(device.mac_address, device);
          if (device.id >= this.nextDeviceId) {
            this.nextDeviceId = device.id + 1;
          }
        });
        console.log(`${devices.length}件のデバイス位置データを読み込みました`);
      }
    } catch (error) {
      console.error('データの読み込み中にエラーが発生しました:', error);
    }
  }

  /**
   * ディスクにデータを保存
   */
  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ビーコンデータの保存
      const beaconsPath = `${this.dbPath}-beacons.json`;
      const beacons = Array.from(this.beacons.values());
      fs.writeFileSync(beaconsPath, JSON.stringify(beacons, null, 2));

      // デバイス位置データの保存
      const locationsPath = `${this.dbPath}-devices.json`;
      const devices = Array.from(this.deviceLocations.values());
      fs.writeFileSync(locationsPath, JSON.stringify(devices, null, 2));

      console.log(`データを保存しました: ${beacons.length}件のビーコン、${devices.length}件のデバイス`);
    } catch (error) {
      console.error('データの保存中にエラーが発生しました:', error);
    }
  }

  /**
   * ビーコン情報を保存または更新
   */
  public saveBeacon(beacon: BeaconRecord): void {
    this.beacons.set(beacon.id, beacon);
  }

  /**
   * すべてのビーコン情報を取得
   */
  public getAllBeacons(): BeaconRecord[] {
    return Array.from(this.beacons.values());
  }

  /**
   * デバイス位置情報を保存または更新
   */
  public saveDeviceLocation(device: DeviceLocationRecord): void {
    if (!device.id || device.id === 0) {
      device.id = this.nextDeviceId++;
    }
    this.deviceLocations.set(device.mac_address, device);
  }

  /**
   * すべてのデバイス位置情報を取得
   */
  public getAllDeviceLocations(): DeviceLocationRecord[] {
    return Array.from(this.deviceLocations.values());
  }

  /**
   * 特定のMACアドレスを持つデバイス位置情報を取得
   */
  public getDeviceLocationByMacAddress(macAddress: string): DeviceLocationRecord | undefined {
    return this.deviceLocations.get(macAddress);
  }

  /**
   * 指定した期間より前の古いデバイス位置情報を削除
   */
  public cleanupOldDevices(maxAgeSeconds: number): number {
    const cutoffTime = Math.floor(Date.now() / 1000) - maxAgeSeconds;
    let deletedCount = 0;

    // 古いデバイスを削除
    this.deviceLocations.forEach((device, macAddress) => {
      if (device.last_seen < cutoffTime) {
        this.deviceLocations.delete(macAddress);
        deletedCount++;
      }
    });

    // 変更があった場合はディスクに保存
    if (deletedCount > 0) {
      this.saveToDisk();
    }

    return deletedCount;
  }

  /**
   * データベースを閉じる（保存を実行）
   */
  public close(): void {
    this.saveToDisk();
  }
}

// プロセス終了時に保存を実行
process.on('SIGINT', () => {
  console.log('データを保存して終了します...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('データを保存して終了します...');
  db.close();
  process.exit(0);
});

// データベースのインスタンスを作成
const dbPath = path.join(__dirname, '../../data/bluetooth_tracker');
export const db = new DatabaseManager(dbPath);
