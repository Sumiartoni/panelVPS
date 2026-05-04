# VPS Dashboard

Dashboard mandiri untuk memantau beban VPS secara realtime dan melihat statistik pengunjung dari access log web server.

## Fitur

- Login admin berbasis session
- Monitoring CPU, RAM, disk, network, uptime
- Statistik request dan visitor unik dari access log
- Feed akses terbaru
- Top IP dan top path

## Cara pakai di VPS

1. Upload folder ini ke VPS.
2. Jalankan `npm install`.
3. Copy `.env.example` menjadi `.env`.
4. Untuk setup cepat, isi `ADMIN_PASSWORD` di `.env`.
5. Jika ingin lebih aman, gunakan hash bcrypt:
   - `node -e "console.log(require('bcryptjs').hashSync('PASSWORD_ANDA', 10))"`
6. Isi `ADMIN_PASSWORD_HASH` lalu kosongkan `ADMIN_PASSWORD`.
7. Sesuaikan `LOG_PATHS` dengan access log yang ingin dipantau.
8. Jalankan `npm start`.
9. Akses `http://IP_VPS:3007`.

## Deploy via Git

```bash
cd /opt
sudo git clone https://github.com/Sumiartoni/panelVPS.git vps-dashboard
sudo chown -R $USER:$USER /opt/vps-dashboard
cd /opt/vps-dashboard
npm install
cp .env.example .env
nano .env
```

Lalu jalankan salah satu:

### Opsi 1: PM2

```bash
sudo npm install -g pm2
cd /opt/vps-dashboard
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Opsi 2: systemd

```bash
sudo cp deploy/vps-dashboard.service /etc/systemd/system/vps-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now vps-dashboard
sudo systemctl status vps-dashboard
```

## Catatan

- Project ini terpisah dari website utama Anda.
- Agar visitor website terbaca, access log Nginx/Apache harus tersedia dan bisa dibaca proses Node.js.
- Untuk produksi, sebaiknya jalankan dengan `pm2` atau `systemd`.
