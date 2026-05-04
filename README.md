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

## Catatan

- Project ini terpisah dari website utama Anda.
- Agar visitor website terbaca, access log Nginx/Apache harus tersedia dan bisa dibaca proses Node.js.
- Untuk produksi, sebaiknya jalankan dengan `pm2` atau `systemd`.
