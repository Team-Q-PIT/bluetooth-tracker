#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import time
import yaml
import argparse
import logging
import statistics
import aiohttp
from bleak import BleakScanner

# ロギングの設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('bluetooth_beacon')

class BluetoothBeacon:
    def __init__(self, config_path, server_url):
        self.config_path = config_path
        self.server_url = server_url
        self.beacon_id = None
        self.location = None
        self.scan_duration = 30  # 30秒間スキャン
        self.scan_interval = 5   # 5秒間隔でスキャン
        self.load_config()

    def load_config(self):
        """設定ファイルを読み込む"""
        try:
            with open(self.config_path, 'r') as file:
                config = yaml.safe_load(file)
                self.beacon_id = config.get('beacon_id')
                self.location = {
                    'zone': config.get('zone'),
                    'x': config.get('x'),
                    'y': config.get('y')
                }
                logger.info(f"設定を読み込みました: ID={self.beacon_id}, 位置={self.location}")
        except Exception as e:
            logger.error(f"設定ファイルの読み込みに失敗しました: {e}")
            raise

    async def scan_devices(self):
        """30秒間Bluetoothデバイスをスキャンし、RSSIの平均値を計算する"""
        logger.info(f"{self.scan_duration}秒間のスキャンを開始します...")
        
        # デバイスごとのRSSI値を格納する辞書
        devices_rssi = {}
        
        # スキャン開始時間
        start_time = time.time()
        
        # スキャン期間中、複数回スキャンを実行
        while time.time() - start_time < self.scan_duration:
            # デバイスをスキャン
            devices = await BleakScanner.discover(timeout=3.0)
            
            for device in devices:
                if device.address not in devices_rssi:
                    devices_rssi[device.address] = []
                
                # RSSI値を記録
                if device.rssi is not None:
                    devices_rssi[device.address].append(device.rssi)
                    
                    # デバッグ用に各デバイスのRSSI値を表示
                    logger.debug(f"デバイス {device.address} (名前: {device.name}): RSSI={device.rssi}")
            
            # 短い間隔を空けて再スキャン
            await asyncio.sleep(1)
        
        # 平均RSSI値の計算
        result = []
        for mac_address, rssi_values in devices_rssi.items():
            if rssi_values:
                avg_rssi = statistics.mean(rssi_values)
                device_info = {
                    'mac_address': mac_address,
                    'rssi': avg_rssi,
                    'sample_count': len(rssi_values)
                }
                result.append(device_info)
                logger.debug(f"デバイス {mac_address}: 平均RSSI={avg_rssi:.2f} ({len(rssi_values)}サンプル)")
        
        logger.info(f"{len(result)}台のデバイスを検出しました")
        return result

    async def send_data(self, devices_data):
        """サーバーにデータを送信する"""
        if not devices_data:
            logger.info("送信するデータがありません")
            return
        
        payload = {
            'beacon_id': self.beacon_id,
            'location': self.location,
            'timestamp': time.time(),
            'devices': devices_data
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.server_url, json=payload) as response:
                    if response.status == 200:
                        logger.info(f"データを正常に送信しました: {len(devices_data)}台のデバイス情報")
                    else:
                        logger.error(f"データの送信に失敗しました: HTTP {response.status}")
                        logger.error(await response.text())
        except Exception as e:
            logger.error(f"データ送信中にエラーが発生しました: {e}")

    async def run_forever(self):
        """定期的にスキャンと送信を実行する"""
        logger.info(f"ビーコン {self.beacon_id} を開始します...")
        
        while True:
            try:
                # デバイスをスキャン
                devices_data = await self.scan_devices()
                
                # サーバーにデータを送信
                await self.send_data(devices_data)
                
                # 次のスキャンまで待機
                logger.info(f"{self.scan_interval}秒後に次のスキャンを開始します")
                await asyncio.sleep(self.scan_interval)
                
            except Exception as e:
                logger.error(f"実行中にエラーが発生しました: {e}")
                await asyncio.sleep(10)  # エラー発生時は少し長めに待機

async def main():
    # コマンドライン引数の解析
    parser = argparse.ArgumentParser(description='Bluetooth Beacon')
    parser.add_argument('--config', type=str, default='config.yaml', help='設定ファイルのパス')
    parser.add_argument('--server', type=str, default='http://localhost:3000/api/beacons/data', help='サーバーのURL')
    args = parser.parse_args()
    
    # ビーコンの初期化と実行
    beacon = BluetoothBeacon(args.config, args.server)
    await beacon.run_forever()

if __name__ == '__main__':
    asyncio.run(main())
