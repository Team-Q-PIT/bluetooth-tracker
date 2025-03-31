{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Node.js と TypeScript 関連
    nodejs_20
    nodePackages.typescript
    nodePackages.ts-node
    bun

    # Python 関連
    (python311.withPackages (ps: with ps; [
      pip
      pyyaml
      aiohttp
      # bleak は pip で別途インストールする必要がある
    ]))

    # 開発ツール
    sqlite
    git
  ];

  shellHook = ''
    echo "Bluetooth Tracker 開発環境に入りました"
    echo "サーバーの起動方法: cd server && npm run dev"
    echo "ビーコンの起動方法: python beacon.py --config config.yaml"
    echo ""
    echo "注意: bleakパッケージはpipを使ってインストールする必要があります:"
    echo "pip install bleak"
    echo ""
  '';
}
