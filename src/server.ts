import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { Server } from 'socket.io';
import fs from 'fs';
import { LocationController } from './controllers/locationController';
import { ApiController } from './controllers/apiController';

// データディレクトリの作成
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Expressアプリケーションの設定
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ミドルウェアの設定
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// コントローラーの初期化
const locationController = new LocationController(io);
const apiController = new ApiController(locationController);

// APIルートの設定
app.post('/api/beacons/data', apiController.receiveBeaconData);
app.get('/api/devices/locations', apiController.getDeviceLocations);

// クライアントアプリのルートをサーブ
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// サーバーの起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
});

// WebSocketの接続ハンドラ
io.on('connection', (socket) => {
  console.log('新しいクライアント接続:', socket.id);
  
  // 接続時に最新のデバイス位置情報を送信
  locationController.broadcastDeviceLocations();
  
  socket.on('disconnect', () => {
    console.log('クライアント切断:', socket.id);
  });
});

// プロセス終了時の処理
process.on('SIGINT', () => {
  console.log('サーバーを終了します...');
  server.close(() => {
    console.log('サーバーが終了しました');
    process.exit(0);
  });
});
