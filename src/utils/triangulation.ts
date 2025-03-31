import { RssiData } from '../types';

/**
 * RSSIから距離を推定する関数
 * @param rssi 測定されたRSSI値
 * @param txPower 送信出力（通常は1m距離でのRSSI値）
 * @param n 環境係数（通常は2〜4）
 * @returns 推定距離（メートル）
 */
export function rssiToDistance(rssi: number, txPower: number = -59, n: number = 2.0): number {
  // RSSIをdBmから距離（メートル）に変換
  // 距離 = 10 ^ ((TxPower - RSSI) / (10 * n))
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

/**
 * 三点測量法によるデバイスの位置推定
 * @param rssiDataArray 3つ以上のビーコンからのRSSIデータ配列
 * @returns 推定された位置 [x, y] または未定義
 */
export function trilaterate(rssiDataArray: RssiData[]): [number, number] | undefined {
  // 少なくとも3つのビーコンデータが必要
  if (rssiDataArray.length < 3) {
    console.log('三点測量には少なくとも3つのビーコンデータが必要です');
    return undefined;
  }

  // ビーコンの座標と推定距離を取得
  const points: Array<[number, number, number]> = rssiDataArray.map(data => [
    data.x,
    data.y,
    rssiToDistance(data.rssi)
  ]);

  // 最小二乗法による位置推定
  try {
    return weightedLeastSquares(points);
  } catch (error) {
    console.error('三点測量に失敗しました:', error);
    return undefined;
  }
}

/**
 * 重み付き最小二乗法による位置推定
 * @param points ビーコンの座標と距離の配列 [[x1, y1, d1], [x2, y2, d2], ...]
 * @returns 推定された位置 [x, y]
 */
function weightedLeastSquares(points: Array<[number, number, number]>): [number, number] {
  // 最初のポイントを原点として使用
  const [x0, y0] = [points[0][0], points[0][1]];
  
  // 行列計算のための配列を準備
  const A: number[][] = [];
  const b: number[] = [];
  
  // 各ビーコンからの方程式を設定
  for (let i = 1; i < points.length; i++) {
    const [xi, yi, di] = points[i];
    const [x1, y1, d1] = points[0];
    
    // 方程式の設定（線形化された三点測量方程式）
    A.push([
      2 * (xi - x0),
      2 * (yi - y0)
    ]);
    
    b.push(
      Math.pow(xi, 2) - Math.pow(x0, 2) +
      Math.pow(yi, 2) - Math.pow(y0, 2) +
      Math.pow(d1, 2) - Math.pow(di, 2)
    );
  }
  
  // 行列の疑似逆行列を使用して解を計算
  const result = pseudoInverse(A, b);
  
  // RSSIは不安定なので、結果を整数にまるめる
  return [Math.round(result[0]), Math.round(result[1])];
}

/**
 * 疑似逆行列を用いた線形方程式の解法
 * @param A 係数行列
 * @param b 右辺ベクトル
 * @returns 解ベクトル
 */
function pseudoInverse(A: number[][], b: number[]): number[] {
  // 行列の転置
  const AT = transpose(A);
  
  // A^T・A の計算
  const ATA = multiply(AT, A);
  
  // (A^T・A)^(-1) の計算（2x2行列の逆行列）
  const ATAInv = inverse2x2(ATA);
  
  // (A^T・A)^(-1)・A^T の計算
  const ATAInvAT = multiply(ATAInv, AT);
  
  // (A^T・A)^(-1)・A^T・b の計算
  return multiplyVec(ATAInvAT, b);
}

/**
 * 行列の転置
 */
function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const result: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0));
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j];
    }
  }
  
  return result;
}

/**
 * 行列の積
 */
function multiply(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const rowsB = B.length;
  const colsB = B[0].length;
  
  if (colsA !== rowsB) {
    throw new Error('行列の積の計算に失敗: 行列のサイズが一致しません');
  }
  
  const result: number[][] = Array(rowsA).fill(0).map(() => Array(colsB).fill(0));
  
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  
  return result;
}

/**
 * 行列とベクトルの積
 */
function multiplyVec(A: number[][], b: number[]): number[] {
  const rows = A.length;
  const cols = A[0].length;
  
  if (cols !== b.length) {
    throw new Error('行列とベクトルの積の計算に失敗: サイズが一致しません');
  }
  
  const result: number[] = Array(rows).fill(0);
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i] += A[i][j] * b[j];
    }
  }
  
  return result;
}

/**
 * 2x2行列の逆行列
 */
function inverse2x2(A: number[][]): number[][] {
  if (A.length !== 2 || A[0].length !== 2) {
    throw new Error('2x2行列の逆行列の計算に失敗: 2x2行列ではありません');
  }
  
  const a = A[0][0];
  const b = A[0][1];
  const c = A[1][0];
  const d = A[1][1];
  
  const det = a * d - b * c;
  
  if (Math.abs(det) < 1e-10) {
    throw new Error('行列が特異です（逆行列が存在しません）');
  }
  
  return [
    [d / det, -b / det],
    [-c / det, a / det]
  ];
}
