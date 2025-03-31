import { Request, Response } from 'express';
import { LocationController } from './locationController';
import { BeaconData } from '../types';

/**
 * API エンドポイントのコントローラー
 */
export class ApiController {
  private locationController: LocationController;

  constructor(locationController: LocationController) {
    this.locationController = locationController;
  }

  /**
   * ビーコンデータを受信するエンドポイント
   */
  public receiveBeaconData = (req: Request, res: Response): void => {
    try {
      const data = req.body as BeaconData;
      
      // 入力データの検証
      if (!data.beacon_id || !data.location || !data.devices) {
        res.status(400).json({ error: '必要なデータが不足しています' });
        return;
      }
      
      // タイムスタンプが不足している場合は現在時刻を使用
      if (!data.timestamp) {
        data.timestamp = Math.floor(Date.now() / 1000);
      }
      
      // 位置情報コントローラーにデータを渡す
      this.locationController.processBeaconData(data);
      
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('ビーコンデータの処理中にエラーが発生しました:', error);
      res.status(500).json({ error: 'サーバーエラー' });
    }
  };

  /**
   * デバイスの最新位置情報を取得するエンドポイント
   */
  public getDeviceLocations = (_req: Request, res: Response): void => {
    try {
      // 最新のデバイス位置情報を送信するだけなので、broadcastを呼び出す
      this.locationController.broadcastDeviceLocations();
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('デバイス位置情報の取得中にエラーが発生しました:', error);
      res.status(500).json({ error: 'サーバーエラー' });
    }
  };
}
