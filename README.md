# Boss Timer Discord Bot (Hybrid Cooldown & Schedule)

Bot Discord untuk melacak jadwal dan cooldown respawn boss menggunakan **Node.js + TypeScript + discord.js v14 + SQLite**.

## Fitur Utama

- **Sistem Waktu Hybrid**:
  - **Mode Cooldown**: Hitung mundur setelah boss mati (`/kill`), termasuk dukungan **random spawn window** (`respawn` s/d `respawn_max`).
  - **Mode Jadwal Tetap**: Spawn di hari dan jam tertentu sesuai zona waktu server (misal `Asia/Jakarta`).
- **Live Countdown Board (`/board setup`)**:
  - Pesan board yang otomatis diperbarui dengan timestamp countdown Discord live (`<t:...:R>`).
  - Dilengkapi dropdown **Quick Kill**, tombol **Catat Kill (Custom)** via modal, **Semua Boss**, dan **Refresh**.
- **Auto-Reminder & Spawn Alert**:
  - Pengingat otomatis bertingkat sebelum spawn (default: `15`, `5`, `1` menit sebelumnya), notifikasi saat window/spawn terbuka, serta tombol **Tandai Mati Sekarang** langsung di pesan alert.
  - Deduplikasi alert di SQLite agar tidak mengirim notifikasi ganda saat bot restart.
- **Manajemen Lengkap via Discord**:
  - `/boss add-cooldown`, `/boss add-schedule`, `/boss edit`, `/boss delete`, `/boss toggle`, `/boss seed` (template contoh), `/boss export` & `/boss import` (JSON).
  - `/kill` mendukung input `ago` (misal `15m`, `1h 30m`) atau `time` (misal `20:15`).
  - `/timer set`, `/timer reset`, `/timer info` (termasuk riwayat kill).
  - `/config` untuk mengatur channel alert, zona waktu, reminder default, mention target (`@Role`, `@everyone`, `@here`, silent), grace period, dan role manager.

---

## Persiapan Bot di Discord Developer Portal

1. Buka [Discord Developer Portal](https://discord.com/developers/applications) lalu klik **New Application**.
2. Di menu **General Information**, salin **Application ID** (untuk `DISCORD_CLIENT_ID`).
3. Di menu **Bot**, klik **Reset Token** lalu salin tokennya (untuk `DISCORD_TOKEN`).
   *(Bot ini hanya memakai gateway intent `Guilds`, jadi tidak perlu mengaktifkan Privileged Intents.)*
4. Di menu **OAuth2 → URL Generator**:
   - **Scopes**: centang `bot` dan `applications.commands`
   - **Bot Permissions**: centang `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Mention Everyone` (jika ingin ping `@everyone`/`@here`/role)
   - Buka URL yang dihasilkan untuk mengundang bot ke server Discord kamu.

---

## Instalasi & Menjalankan Bot

1. Install dependencies:
   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env` lalu isi token dan client ID:
   ```bash
   cp .env.example .env
   ```
   *(Di PowerShell: `Copy-Item .env.example .env`)*

   Isi `.env`:
   - `DISCORD_TOKEN`: Token bot kamu
   - `DISCORD_CLIENT_ID`: Application ID bot kamu
   - `DISCORD_GUILD_ID` *(opsional)*: Isi ID server kamu agar slash command langsung muncul instan (< 1 detik) saat deploy. Kosongkan jika ingin register global.

3. Daftarkan Slash Commands ke Discord:
   ```bash
   npm run deploy
   ```

4. Jalankan bot:
   - Mode development (auto-reload):
     ```bash
     npm run dev
     ```
   - Mode production:
     ```bash
     npm run build
     npm start
     ```

---

## Panduan Cepat Setup di Server Discord

1. Atur zona waktu & channel alert:
   - `/config timezone zone:Asia/Jakarta`
   - `/config channels alert_channel:#boss-alert`
   - `/config mention mode:Role Tertentu role:@BossHunter` *(opsional)*
2. Tambah boss (atau muat preset **Architect** langsung):
   - `/boss seed` *(default: **Field Boss Group I** pada `08:15, 11:15, 20:15, 23:15 WIB`, otomatis lanjut ke siklus berikutnya setelah spawn)*
   - Pilihan preset lain di `/boss seed`:
     - `Architect: Field Boss Group I (Karugura, Tagar, Gigas)`
     - `Architect: World Boss (Agarash, Shahgar, Behemoth)` *(20:00 WIB harian & 2 hari sekali)*
     - `Architect: Giant's Tower 1F-3F (Gishkal, Halpasiam, Drugamu)` *(20:00 WIB sesuai hari masing-masing lantai)*
     - `Architect: Semua Paket` *(memuat seluruh preset Architect sekaligus)*
   - Atau tambah manual:
     - `/boss add-cooldown name:World Boss A respawn:2h respawn_max:2h 30m`
     - `/boss add-schedule name:World Boss B days:daily times:20:00`
3. Pasang Live Board:
   - `/board setup channel:#boss-board`
4. Mulai pakai:
   - Pilih boss di dropdown **Quick Kill** pada board, klik tombol **Catat Kill (Custom)**, atau ketik `/kill`.

---

## Deploy 24 Jam ke Railway

Project ini sudah dilengkapi `Dockerfile`, `.dockerignore`, dan `railway.toml` agar siap jalan 24/7 di Railway.

1. **Upload ke GitHub** (buat repository baru di GitHub, lalu push folder ini):
   ```powershell
   git init
   git add .
   git commit -m "Initial Discord boss timer bot"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPO-KAMU.git
   git push -u origin main
   ```
   *(File `.env` dan `data/` sudah otomatis diabaikan oleh `.gitignore`.)*

2. **Buat Project di Railway**:
   - Buka [Railway](https://railway.app) → **New Project → Deploy from GitHub repo** → pilih repo kamu.
   - Railway otomatis mendeteksi `railway.toml` & `Dockerfile` dan membangun image.

3. **Isi Variables di Railway** (tab **Variables**):
   - `DISCORD_TOKEN` = Token bot Discord kamu
   - `DISCORD_CLIENT_ID` = Application ID bot kamu
   - `DISCORD_GUILD_ID` *(opsional)* = ID server Discord kamu agar slash command langsung muncul instan (< 1 detik). Jika dikosongkan, command didaftarkan secara global.
   *(Saat berjalan di Railway, bot otomatis mendaftarkan slash commands saat startup.)*

4. **Pasang Persistent Volume (Wajib agar database SQLite tidak hilang)**:
   - Di service Railway → klik **+ New / Add Volume** (atau shortcut `Ctrl+K` → *Add Volume*).
   - Isi **Mount Path**: `/app/data`
   - `Dockerfile` sudah mengarahkan `DATABASE_PATH=/app/data/boss-timer.db`, sehingga seluruh boss, timer, dan pengaturan server tersimpan permanen di Volume tersebut saat redeploy/restart.

5. **Cek Deploy Logs**:
   - Di tab **Deployments → View Logs**, pastikan muncul log:
     - `[Deploy] Berhasil mendaftarkan 6 slash command...`
     - `[Discord] Login sebagai ... • Aktif di X server.`

---

## Testing & Verifikasi

```bash
npm run typecheck
npm test
npm run build
```
