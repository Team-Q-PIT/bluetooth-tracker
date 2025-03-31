/**
 * Bluetoothデバイスの情報
 */
export interface DeviceInfo {
  mac_address: string;
  rssi: number;
  sample_count: number;
  name?: string;
}

/**
 * ビーコンの位置情報
 */
export interface BeaconLocation {
  zone: string;
  x: number;
  y: number;
}

/**
 * ビーコンからのデータペイロード
 */
export interface BeaconData {
  beacon_id: string;
  location: BeaconLocation;
  timestamp: number;
  devices: DeviceInfo[];
}

/**
 * データベースに保存されるビーコン情報
 */
export interface BeaconRecord {
  id: string;
  zone: string;
  x: number;
  y: number;
  last_seen: number;
}

/**
 * データベースに保存されるデバイス位置情報
 */
export interface DeviceLocationRecord {
  id: number;
  mac_address: string;
  name?: string;
  x: number;
  y: number;
  last_seen: number;
  rssi_values: string; // JSON文字列として保存
}

/**
 * クライアントに送信するデバイス位置情報
 */
export interface DeviceLocationData {
  mac_address: string;
  name?: string;
  x: number;
  y: number;
  last_seen: number;
  zone: string;
}

/**
 * 三点測量のためのRSSIデータ
 */
export interface RssiData {
  beacon_id: string;
  x: number;
  y: number;
  rssi: number;
}
