# Kịch bản Video Demo 3 Phút & Pitch — SokoSats (Dakar Bitcoin Hack by BTrust)

**Thời lượng chuẩn:** 02:45 – 03:00 | **Ngôn ngữ:** Tiếng Anh (hoặc Pháp/Anh kèm phụ đề)

---

## 0:00 – 0:40 | Hook & Bài toán thực tế tại Tây/Đông Phi
- **Thao tác màn hình:** Mở URL app SokoSats đã deploy trên Railway, bật Chrome DevTools (`F12`) → chọn chế độ giả lập điện thoại (`390x844`) + hạ băng thông xuống **Slow 3G** → tải lại trang để cho giám khảo thấy giao diện tải dưới 300ms (~14 KB).
- **Lời thoại:**
  > "Across Dakar, Lagos, and Nairobi, millions of micro-merchants deal with cash change shortages, high mobile money fees, and slow 2G/3G networks. Meet SokoSats — an ultra-lightweight, AI-assisted Bitcoin & Lightning Point-of-Sale built for low-end phones. At the top, the merchant immediately gets a non-custodial BIP84 Native SegWit wallet derived via bitcoinjs-lib, with zero custodial middlemen."

## 0:40 – 1:40 | AI Order Parser đa ngôn ngữ (French / English / Wolof → Sats)
- **Thao tác màn hình:**
  1. Bấm vào 1–2 nút món ăn mẫu (*Riz parfumé 650 XOF*, *Thé Attaya 500 XOF*) hoặc gõ trực tiếp vào ô nhập: `2kg riz 1300 CFA, 1 huile 1100 CFA`.
  2. Bấm **1. Calculer avec AI (Convertir en Sats)**.
  3. Chỉ vào từng dòng item đã tách chuẩn (`2kg riz: 1300 XOF`, `1 huile: 1100 XOF`) và tổng số **sats** quy đổi theo tỷ giá BTC/USD live từ Coinbase.
- **Lời thoại:**
  > "Instead of typing complex calculators, a street vendor simply types or dictates an order in French, English, or Wolof — like '2kg riz 1300 CFA, 1 huile 1100 CFA'. Our AI parser extracts each line item accurately, converts local CFA Francs, Naira, or Shillings into satoshis using live Bitcoin spot rates, and even falls back to an offline deterministic parser if the internet drops."

## 1:40 – 2:40 | Tạo & Thanh toán Hóa đơn Lightning BOLT11 thật (LNURL-pay)
- **Thao tác màn hình:**
  1. Giữ nguyên hoặc nhập một Lightning Address thật (ví dụ `... @getalby.com` hoặc `... @walletofsatoshi.com`).
  2. Bấm **2. Générer Facture Lightning (BOLT11)**.
  3. Khi mã QR SVG và chuỗi `lnbc...` xuất hiện, bấm **Copier BOLT11 Invoice** (hoặc dùng ví Alby Extension / điện thoại quét QR thanh toán thử).
- **Lời thoại:**
  > "Next, with one tap, SokoSats queries the merchant's Lightning Address via standard LNURL-pay and generates a real, verifiable BOLT11 Lightning invoice and lightweight SVG QR code. Customers can pay instantly from any Lightning wallet — Phoenix, Zeus, Wallet of Satoshi, or WebLN — and funds settle directly into the merchant's wallet."

## 2:40 – 3:00 | Open-Source MIT & Kết thúc
- **Thao tác màn hình:** Chuyển tab sang GitHub repository public `sokosats-lightning-pos`, chỉ vào file `LICENSE` (MIT), `Dockerfile`, và chạy nhanh `npm test` (hoặc show kết quả test).
- **Lời thoại:**
  > "SokoSats is 100% open-source under the MIT license, ships with a one-command Docker setup, and runs smoothly on any entry-level smartphone. Thank you BTrust and Dakar Bitcoin Hack!"