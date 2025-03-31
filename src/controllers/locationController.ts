import { db } from '../models/database';
import { trilaterate } from '../utils/triangulation';
import { BeaconData, DeviceInfo, DeviceLocationData, RssiData } from '../types';
import { Server } from 'socket.io';

/**
 * 位置情報コントローラー
 */
export class LocationController {
  private io: Server;
  private activeBeacons: Map<string, { x: number; y: number; zone: string; timestamp: number }> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.loadActiveBeacons();
    
    // 定期的に古いデバイスデータをクリーンアップ（1時間以上古いデータを削除）
    setInterval(() => {
      const deleted = db.cleanupOldDevices(1800); // 30分以上前のデータを削除
      if (deleted > 0) {
        console.log(`${deleted}件の古いデバイスデータを削除しました`);
      }
    }, 5 * 60 * 1000); // 5分ごとに実行
  }

  /**
   * アクティブなビーコン情報をデータベースから読み込む
   */
  private loadActiveBeacons(): void {
    const beacons = db.getAllBeacons();
    beacons.forEach(beacon => {
      this.activeBeacons.set(beacon.id, {
        x: beacon.x,
        y: beacon.y,
        zone: beacon.zone,
        timestamp: beacon.last_seen
      });
    });
    console.log(`${this.activeBeacons.size}台のビーコン情報を読み込みました`);
  }

  /**
   * ビーコンデータを処理し、デバイスの位置を推定する
   */
  public processBeaconData(data: BeaconData): void {
    // ビーコン情報を更新
    this.updateBeaconInfo(data);
    
    // デバイス情報を処理
    data.devices.forEach(device => {
      this.processDeviceInfo(device, data.beacon_id, data.location, data.timestamp);
    });
    
    // 更新された位置情報をクライアントに送信
    this.broadcastDeviceLocations();
  }

  /**
   * ビーコン情報を更新
   */
  private updateBeaconInfo(data: BeaconData): void {
    // ビーコン情報をデータベースに保存
    db.saveBeacon({
      id: data.beacon_id,
      zone: data.location.zone,
      x: data.location.x,
      y: data.location.y,
      last_seen: data.timestamp
    });
    
    // アクティブビーコンリストを更新
    this.activeBeacons.set(data.beacon_id, {
      x: data.location.x,
      y: data.location.y,
      zone: data.location.zone,
      timestamp: data.timestamp
    });
  }

  /**
   * デバイス情報を処理し、位置を推定する
   */
  private processDeviceInfo(
    device: DeviceInfo,
    beaconId: string,
    location: { zone: string; x: number; y: number },
    timestamp: number
  ): void {
    // 現在のデバイス情報を取得
    const currentDeviceInfo = db.getDeviceLocationByMacAddress(device.mac_address);
    
    // RSSIデータの準備
    let rssiValues: Record<string, RssiData> = {};
    
    if (currentDeviceInfo) {
      // 既存のRSSIデータを読み込む
      try {
        rssiValues = JSON.parse(currentDeviceInfo.rssi_values);
      } catch (e) {
        console.error(`RSSIデータの解析に失敗しました: ${e}`);
        rssiValues = {};
      }
    }
    
    // 新しいRSSIデータを追加/更新
    rssiValues[beaconId] = {
      beacon_id: beaconId,
      x: location.x,
      y: location.y,
      rssi: device.rssi
    };
    
    // 位置推定に必要な形式にRSSIデータを変換
    const rssiDataArray: RssiData[] = Object.values(rssiValues);
    
    // 位置を推定
    let x = 0;
    let y = 0;
    
    if (rssiDataArray.length >= 3) {
      // 3つ以上のビーコンデータがある場合は三点測量を実行
      const position = trilaterate(rssiDataArray);
      if (position) {
        [x, y] = position;
      } else {
        // 三点測量に失敗した場合は、最も強いRSSIを持つビーコンの位置を使用
        const strongestBeacon = rssiDataArray.reduce((prev, current) => 
          (current.rssi > prev.rssi) ? current : prev
        );
        x = strongestBeacon.x;
        y = strongestBeacon.y;
      }
    } else if (rssiDataArray.length > 0) {
      // 1つか2つのビーコンデータしかない場合は、最も強いRSSIを持つビーコンの位置を使用
      const strongestBeacon = rssiDataArray.reduce((prev, current) => 
        (current.rssi > prev.rssi) ? current : prev
      );
      x = strongestBeacon.x;
      y = strongestBeacon.y;
    }
    
    // デバイスの位置情報をデータベースに保存
    db.saveDeviceLocation({
      id: currentDeviceInfo?.id || 0,
      mac_address: device.mac_address,
      name: device.name,
      x,
      y,
      last_seen: timestamp,
      rssi_values: JSON.stringify(rssiValues)
    });
  }

  /**
   * 全てのデバイスの最新位置情報をクライアントに送信
   */
  public broadcastDeviceLocations(): void {
    const devices = db.getAllDeviceLocations();
    const deviceLocations: DeviceLocationData[] = devices.map(device => {
      const latestBeacon = this.findLatestBeaconInZone(device.x, device.y);
      return {
        mac_address: device.mac_address,
        name: device.name,
        x: device.x,
        y: device.y,
        last_seen: device.last_seen,
        zone: latestBeacon?.zone || 'unknown'
      };
    });
    
    // ビーコン情報も送信
    this.broadcastBeaconLocations();
    
    // WebSocketを通じてクライアントに送信
    this.io.emit('deviceLocations', deviceLocations);
  }
  
  /**
   * 全てのビーコンの情報をクライアントに送信
   */
  public broadcastBeaconLocations(): void {
    const beacons = db.getAllBeacons();
    const beaconLocations = beacons.map(beacon => ({
      id: beacon.id,
      x: beacon.x,
      y: beacon.y,
      zone: beacon.zone,
      last_seen: beacon.last_seen
    }));
    
    // WebSocketを通じてクライアントに送信
    this.io.emit('beaconLocations', beaconLocations);
  }

  /**
   * 指定した座標に最も近いビーコンを探す
   */
  private findLatestBeaconInZone(x: number, y: number): { zone: string } | undefined {
    if (this.activeBeacons.size === 0) {
      return undefined;
    }
    
    // 最も近いビーコンを見つける
    let closestBeacon: { zone: string } | undefined;
    let minDistance = Number.MAX_VALUE;
    
    this.activeBeacons.forEach(beacon => {
      const distance = Math.sqrt(Math.pow(beacon.x - x, 2) + Math.pow(beacon.y - y, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closestBeacon = { zone: beacon.zone };
      }
    });
    
    return closestBeacon;
  }
}
